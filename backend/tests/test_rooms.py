"""Contract tests: rooms REST + websocket duplex signalling (no paid APIs)."""

from fastapi.testclient import TestClient

from app.main import create_app


def make_client(monkeypatch=None):
    app = create_app()
    return TestClient(app)


def test_health_ok():
    c = make_client()
    r = c.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["stt"] in ("groq", "browser")
    assert body["translate"] in ("groq", "mymemory")


def test_create_and_join_room():
    c = make_client()
    code = c.post("/api/rooms").json()["code"]
    assert len(code) == 6
    j = c.post(f"/api/rooms/{code}/join", json={"lang": "en"}).json()
    assert j["code"] == code
    assert j["ws_url_path"].startswith("/ws/")


def test_join_invalid_code_404():
    c = make_client()
    r = c.post("/api/rooms/ZZZZZZ/join", json={"lang": "bn"})
    assert r.status_code == 404


def test_ws_two_peers_exchange_state():
    c = make_client()
    code = c.post("/api/rooms").json()["code"]
    with c.websocket_connect(f"/ws/{code}?lang=en") as ws1:
        ws1.send_json({"type": "hello", "lang": "en"})
        first = ws1.receive_json()
        assert first["type"] == "room-state"
        with c.websocket_connect(f"/ws/{code}?lang=bn") as ws2:
            ws2.send_json({"type": "hello", "lang": "bn"})
            # both sides observe count==2 eventually
            seen_two = False
            for _ in range(4):
                msg = ws1.receive_json() if ws1 else None
                if msg.get("count") == 2:
                    seen_two = True
                    break
            assert seen_two


def test_ws_room_full_rejected():
    c = make_client()
    code = c.post("/api/rooms").json()["code"]
    with c.websocket_connect(f"/ws/{code}?lang=en"):
        with c.websocket_connect(f"/ws/{code}?lang=bn"):
            with c.websocket_connect(f"/ws/{code}?lang=en") as ws3:
                msg = ws3.receive_json()
                assert msg["type"] == "status"
                assert "full" in msg["message"]
