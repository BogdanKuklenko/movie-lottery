import importlib
import sys
from pathlib import Path

import pytest


class _FakeDownloadClient:
    last_category = None
    added = []
    logged_out = False

    def __init__(self, *args, **kwargs):
        pass

    def auth_log_in(self):
        return None

    def auth_log_out(self):
        _FakeDownloadClient.logged_out = True

    def torrents_info(self, category=None):
        _FakeDownloadClient.last_category = category
        return []

    def torrents_add(
        self,
        urls=None,
        category=None,
        is_sequential_download=None,
        is_first_last_piece_priority=None,
    ):
        _FakeDownloadClient.added.append(
            {
                "urls": urls,
                "category": category,
                "is_sequential_download": is_sequential_download,
                "is_first_last_piece_priority": is_first_last_piece_priority,
            }
        )


@pytest.fixture
def app_module(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    sys.modules.pop("app", None)
    module = importlib.import_module("app")
    module.app.config["TESTING"] = True
    with module.app.app_context():
        module.db.drop_all()
        module.db.create_all()
    monkeypatch.setattr(module, "Client", _FakeDownloadClient)
    return module


def _prepare_lottery_movie(module, kinopoisk_id=321):
    with module.app.app_context():
        lottery = module.Lottery(id="lot001", result_name="Test Movie", result_year="2024")
        module.db.session.add(lottery)
        movie = module.Movie(
            kinopoisk_id=kinopoisk_id,
            name="Test Movie",
            poster=None,
            year="2024",
            lottery_id=lottery.id,
        )
        identifier = module.MovieIdentifier(kinopoisk_id=kinopoisk_id, magnet_link="magnet:?xt=test")
        module.db.session.add(movie)
        module.db.session.add(identifier)
        module.db.session.commit()
        lottery_id = lottery.id
    return kinopoisk_id, lottery_id


def test_start_download_uses_lottery_category_when_movie_exists(app_module, monkeypatch):
    module = app_module
    _FakeDownloadClient.added.clear()
    _FakeDownloadClient.last_category = None
    _FakeDownloadClient.logged_out = False

    kinopoisk_id, lottery_id = _prepare_lottery_movie(module)

    client = module.app.test_client()
    response = client.post(f"/api/start-download/{kinopoisk_id}")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["category"] == f"lottery-{lottery_id}"
    assert len(_FakeDownloadClient.added) == 1
    added_entry = _FakeDownloadClient.added[0]
    assert added_entry["urls"] == "magnet:?xt=test"
    assert added_entry["category"] == f"lottery-{lottery_id}"
    assert added_entry["is_sequential_download"] is True
    assert added_entry["is_first_last_piece_priority"] is True
    assert _FakeDownloadClient.logged_out is True


def test_start_download_uses_library_category_when_requested(app_module):
    module = app_module
    _FakeDownloadClient.added.clear()
    _FakeDownloadClient.last_category = None
    _FakeDownloadClient.logged_out = False

    kinopoisk_id = 555
    with module.app.app_context():
        identifier = module.MovieIdentifier(kinopoisk_id=kinopoisk_id, magnet_link="magnet:?xt=library")
        module.db.session.add(identifier)
        module.db.session.commit()

    client = module.app.test_client()
    response = client.post(f"/api/start-download/{kinopoisk_id}?source=library")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["category"] == f"library-{kinopoisk_id}"
    assert len(_FakeDownloadClient.added) == 1
    added_entry = _FakeDownloadClient.added[0]
    assert added_entry["category"] == f"library-{kinopoisk_id}"
