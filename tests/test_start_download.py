import importlib
import sys
from pathlib import Path

import pytest


class _BaseFakeClient:
    last_category = None

    def __init__(self, *args, **kwargs):
        pass

    def auth_log_in(self):
        return None

    def auth_log_out(self):
        _BaseFakeClient.logged_out = True


_BaseFakeClient.logged_out = False


class _FakeDownloadClient(_BaseFakeClient):
    added = []

    def torrents_info(self, category=None):
        _FakeDownloadClient.last_category = category
        return []

    def torrents_add(self, urls=None, category=None, is_sequential=None):
        _FakeDownloadClient.added.append(
            {"urls": urls, "category": category, "is_sequential": is_sequential}
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
    yield module


def test_start_download_calls_search_helper(monkeypatch, app_module):
    module = app_module
    monkeypatch.setattr(module, "Client", _FakeDownloadClient)
    _FakeDownloadClient.added.clear()
    _FakeDownloadClient.last_category = None

    searched_queries = []

    def fake_search(query):
        searched_queries.append(query)
        return [
            {

            }
        ]

    monkeypatch.setattr(module, "_search_torrents", fake_search)

    with module.app.app_context():
        lottery = module.Lottery(
            id="movie1",
            result_name="Мы, нижеподписавшиеся",
            result_year="1980",
        )
        module.db.session.add(lottery)
        module.db.session.commit()

    client = module.app.test_client()
    response = client.post("/api/start-download/movie1")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "началась" in payload["message"]

    assert searched_queries == ["Мы, нижеподписавшиеся 1980"]
    assert _FakeDownloadClient.added == [
        {

            "category": "lottery-movie1",
            "is_sequential": "true",
        }
    ]
    assert _FakeDownloadClient.last_category == "lottery-movie1"

