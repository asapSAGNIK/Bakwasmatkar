"""Translation provider: English <-> Bengali.

Primary: Groq LLM (llama-3.1-8b-instant, 30 RPM / 14.4k RPD free).
  - Context-aware, preserves argument tone and short-chunk coherence.
Fallback: MyMemory public API (no key, ~5k chars/day/IP) for subtitles-only
  continuity when Groq is missing or rate-limited.
"""

import logging

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

_SYSTEM = (
    "You translate live argument speech between English and Bengali. "
    "Rules: output ONLY the translation, no quotes or explanations. "
    "Keep it short and speakable (<=25 words). Preserve emotion and intent. "
    "If input is empty or noise, output empty string."
)


def active_translate_provider() -> str:
    s = get_settings()
    if s.translate_provider != "auto":
        return s.translate_provider
    return "groq" if s.groq_api_key else "mymemory"


async def translate(text: str, src: str, dst: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    if src == dst:
        return text
    try:
        if active_translate_provider() == "groq":
            return await _groq_translate(text, src, dst)
        return await _mymemory_translate(text, src, dst)
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001 - fallback must never break the call
        log.warning("translate failed, trying fallback: %r", exc)
        if active_translate_provider() == "groq":
            return await _mymemory_translate(text, src, dst)
        raise RuntimeError("busy")


async def _groq_translate(text: str, src: str, dst: str) -> str:
    s = get_settings()
    target = "Bengali (বাংলা)" if dst == "bn" else "English"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {s.groq_api_key}"},
            json={
                "model": s.groq_translate_model,
                "temperature": 0.2,
                "max_tokens": 120,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {
                        "role": "user",
                        "content": f"Translate this {src} speech to {target}: {text}",
                    },
                ],
            },
        )
    if r.status_code == 429:
        raise RuntimeError("busy")
    r.raise_for_status()
    out = r.json()["choices"][0]["message"]["content"].strip()
    return out.strip('"“”\' ')


async def _mymemory_translate(text: str, src: str, dst: str) -> str:
    pair = f"{src}|{dst}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text[:400], "langpair": pair},
        )
    if r.status_code == 429:
        raise RuntimeError("busy")
    r.raise_for_status()
    return (r.json().get("responseData", {}).get("translatedText") or "").strip()
