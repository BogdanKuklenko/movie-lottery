 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a//dev/null b/tests/test_torrent_status.py
index 0000000000000000000000000000000000000000..0cca09097118b30f3ac01f85541c164faffdea79 100644
--- a//dev/null
+++ b/tests/test_torrent_status.py
@@ -0,0 +1,65 @@
+import importlib
+import sys
+from pathlib import Path
+
+import pytest
+
+
+class _FakeTorrent:
+    progress = 0.5
+    dlspeed = 1024 * 1024  # 1 MiB/s
+    eta = 120
+    state = "downloading"
+    name = "Test Torrent"
+
+
+class _FakeClient:
+    last_category = None
+    logged_out = False
+
+    def __init__(self, *args, **kwargs):
+        pass
+
+    def auth_log_in(self):
+        return None
+
+    def auth_log_out(self):
+        _FakeClient.logged_out = True
+
+    def torrents_info(self, category=None):
+        _FakeClient.last_category = category
+        return [_FakeTorrent()]
+
+
+@pytest.fixture
+def app_module(monkeypatch):
+    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
+    project_root = Path(__file__).resolve().parent.parent
+    if str(project_root) not in sys.path:
+        sys.path.insert(0, str(project_root))
+    sys.modules.pop("app", None)
+    module = importlib.import_module("app")
+    module.app.config["TESTING"] = True
+    monkeypatch.setattr(module, "Client", _FakeClient)
+    _FakeClient.last_category = None
+    _FakeClient.logged_out = False
+    yield module
+
+
+def test_get_torrent_status_uses_passed_lottery_id(app_module):
+    client = app_module.app.test_client()
+    lottery_id = "abc123"
+
+    response = client.get(f"/api/torrent-status/{lottery_id}")
+
+    assert response.status_code == 200
+    payload = response.get_json()
+    assert payload == {
+        "status": "downloading",
+        "progress": 50.0,
+        "speed_mbps": 1.0,
+        "eta": "2м",
+        "name": "Test Torrent",
+    }
+    assert _FakeClient.last_category == f"lottery-{lottery_id}"
+    assert _FakeClient.logged_out is True
 
EOF
)