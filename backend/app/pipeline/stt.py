"""Speech-to-text provider.

Primary: Groq Whisper (one optional GROQ_API_KEY covers STT+translation).
  - whisper-large-v3-turbo at ~228x realtime, 20 RPM / 2000 RPD free tier.
Fallback: browser-native Web Speech API (client-side, zero key).
  - Server returns provider="browser" so the client captures partials locally
    and sends {type:"text-partial"} instead of audio-chunks.
"""

import base64
import io
import logging

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)


def active_stt_provider() -> str:
    s = get_settings()
    if s.stt_provider != "auto":
        return s.stt_provider
    return "groq" if s.groq_api_key else "browser"


async def transcribe_chunk(audio_b64: str, mime: str, lang: str) -> tuple[str, bool]:
    """Transcribe one ~0.5-1s chunk. Returns (text, is_final).

    Raises RuntimeError("busy") on rate-limit so callers can send a
    graceful status instead of dropping the socket.
    """
    provider = active_stt_provider()
    if provider == "browser":
        return "", False  # client handles STT locally in this mode
    return await _groq_transcribe(audio_b64, mime, lang)


async def _groq_transcribe(audio_b64: str, mime: str, lang: str) -> tuple[str, bool]:
    s = get_settings()
    raw = base64.b64decode(audio_b64)
    if len(raw) > s.max_audio_chunk_bytes:
        raise ValueError("chunk too large")
    ext = "webm" if "webm" in mime else "wav"
    files = {"file": (f"chunk.{ext}", io.BytesIO(raw), mime or "audio/webm")}
    data = {
        "model": s.groq_stt_model,
        "language": "bengali" if lang == "bn" else "english",
        "response_format": "json",
        "temperature": "0",
    }
    headers = {"Authorization": f"Bearer {s.groq_api_key}"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
            )
    except httpx.TimeoutException:
        raise RuntimeError("busy")
    if r.status_code == 429:
        log.warning("groq stt rate-limited")
        raise RuntimeError("busy")
    if r.status_code >= 400:
        log.warning("groq stt %s: %s", r.status_code, r.text[:200])
        raise RuntimeError("busy")
    text = (r.json().get("text") or "").strip()
    return text, bool(text)
