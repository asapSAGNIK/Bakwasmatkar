"""Text-to-speech provider.

Primary: Edge-TTS (Microsoft neural voices, no key):
  - en-US-AriaNeural, bn-IN-TanishaaNeural. Unofficial endpoint, so every
    failure degrades gracefully to browser speechSynthesis (client-side).
Fallback marker: provider "browser" tells the client to speak locally and the
  server to send subtitles-only (still meets PRD reviewer fallback).
Audio is synthesised in-memory per utterance, never written to disk.
"""

import base64
import logging

from ..config import get_settings

log = logging.getLogger(__name__)


def active_tts_provider() -> str:
    s = get_settings()
    if s.tts_provider != "auto":
        return s.tts_provider
    return "edge"  # no key needed; client falls back to browser on failure


async def synthesize(text: str, lang: str, heat: float = 0.0) -> tuple[str, str] | None:
    """Return (audio_b64, mime) or None when client should use browser TTS."""
    text = (text or "").strip()
    if not text or active_tts_provider() == "browser":
        return None
    try:
        import edge_tts

        s = get_settings()
        voice = s.tts_voice_bn if lang == "bn" else s.tts_voice_en
        # F12 tone hint: faster + louder when heat is high (SSML rate/volume).
        rate = "+15%" if heat > 0.65 else "+0%"
        communicate = edge_tts.Communicate(text[:280], voice, rate=rate)
        chunks: list[bytes] = []
        async for part in communicate.stream():
            if part["type"] == "audio" and part.get("data"):
                chunks.append(part["data"])
        if not chunks:
            return None
        return base64.b64encode(b"".join(chunks)).decode(), "audio/mpeg"
    except Exception as exc:  # noqa: BLE001 - TTS must never break translation
        log.warning("edge-tts failed, client fallback: %r", exc)
        return None
