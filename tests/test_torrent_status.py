import importlib
import sys
from pathlib import Path

import pytest


class _FakeTorrent:
    progress = 0.5
    dlspeed = 1024 * 1024  # 1 MiB/s
    eta = 120
    state = "downloading"
    name = "Test Torrent"
    num_seeds = 3
    num_leechs = 1


class _FakeClient:
    last_category = None
    logged_out = False

    def __init__(self, *args, **kwargs):
        pass

    def auth_log_in(self):
        return None

    def auth_log_out(self):
        _FakeClient.logged_out = True

    def torrents_info(self, category=None):
        _FakeClient.last_category = category
        return [_FakeTorrent()]


@pytest.fixture
def app_module(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    sys.modules.pop("app", None)
    module = importlib.import_module("app")
    module.app.config["TESTING"] = True
    monkeypatch.setattr(module, "Client", _FakeClient)
    _FakeClient.last_category = None
    _FakeClient.logged_out = False
    yield module


def test_get_torrent_status_uses_passed_lottery_id(app_module):
    client = app_module.app.test_client()

    response = client.get("/api/torrent-status/abc123")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload == {
        "status": "downloading",
        "progress": "50.0",
        "speed": "1.00",
        "name": "Test Torrent",
        "eta": "0ч 2м",
        "seeds": 3,
        "peers": 1,
        "category": "lottery-abc123",
    }
    assert _FakeClient.last_category == "lottery-abc123"
    assert _FakeClient.logged_out is True


def test_get_torrent_status_accepts_prefixed_category(app_module):
    client = app_module.app.test_client()

    response = client.get("/api/torrent-status/library-777")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["category"] == "library-777"
    assert payload["status"] == "downloading"
    assert _FakeClient.last_category == "library-777"
