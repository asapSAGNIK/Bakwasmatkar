"""Provider fallback tests (offline-safe: monkeypatch network)."""

import pytest

from app.pipeline import translate as tr


@pytest.mark.asyncio
async def test_translate_empty_returns_empty():
    assert await tr.translate("", "en", "bn") == ""


@pytest.mark.asyncio
async def test_translate_same_lang_passthrough():
    assert await tr.translate("hello", "en", "en") == "hello"


@pytest.mark.asyncio
async def test_translate_groq_429_raises_busy(monkeypatch):
    class FakeResp:
        status_code = 429

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResp()

    import httpx as _httpx

    monkeypatch.setattr(_httpx, "AsyncClient", lambda *a, **k: FakeClient())
    monkeypatch.setattr(tr, "active_translate_provider", lambda: "groq")
    import os

    os.environ.setdefault("GROQ_API_KEY", "test")
    with pytest.raises(RuntimeError, match="busy"):
        await tr._groq_translate("hello", "en", "bn")
