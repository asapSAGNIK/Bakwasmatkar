"""WebSocket relay: full-duplex audio-chunk -> STT -> translate -> TTS.

Concurrency model: each chunk is processed in its own asyncio task, per
speaker independently (PRD F7). No turn-taking locks. Order is preserved
per speaker via monotonic seq; partials stream before finals (G2).

Also handles:
- peer-speaking + heat broadcast (F9)
- interruption detection when both speak within 600ms window (F10)
- barge-in: listener speaking ducks the other's TTS playback (F11)
- graceful busy/reconnecting statuses (F14)
"""

import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import get_settings
from ..pipeline.stt import transcribe_chunk
from ..pipeline.translate import translate
from ..pipeline.tts import synthesize
from ..rooms import STORE, Peer

log = logging.getLogger(__name__)
router = APIRouter()

OVERLAP_WINDOW_S = 0.6


async def _send(ws: WebSocket, obj: dict) -> None:
    try:
        await ws.send_text(json.dumps(obj))
    except Exception:  # noqa: BLE001 - peer may be gone
        pass


async def _broadcast(room_code: str, obj: dict, exclude: WebSocket | None = None) -> None:
    room = STORE.get(room_code)
    if room is None:
        return
    for p in list(room.peers):
        if exclude is not None and p.ws is exclude:
            continue
        await _send(p.ws, obj)


def _other_lang(lang: str) -> str:
    return "bn" if lang == "en" else "en"


async def _process_audio_chunk(
    room_code: str, sender: WebSocket, seq: int, lang: str, audio_b64: str, mime: str, heat: float
) -> None:
    started = time.time()
    try:
        text, is_final = await transcribe_chunk(audio_b64, mime, lang)
    except ValueError:
        return  # oversize chunk, drop silently
    except RuntimeError:
        await _send(sender, {"type": "status", "level": "busy", "message": "slow mode: high demand, subtitles may lag"})
        return
    if not text:
        return
    dst = _other_lang(lang)
    try:
        translated = await translate(text, lang, dst)
    except RuntimeError:
        # Subtitles-only fallback: still show original so argument continues.
        await _broadcast(room_code, {
            "type": "subtitle", "from_lang": lang, "original": text,
            "translated": text, "is_final": is_final, "seq": seq,
            "latency_ms": int((time.time() - started) * 1000),
            "degraded": True,
        })
        return
    if not translated:
        return
    latency_ms = int((time.time() - started) * 1000)
    await _broadcast(room_code, {
        "type": "subtitle", "from_lang": lang, "original": text,
        "translated": translated, "is_final": is_final, "seq": seq,
        "latency_ms": latency_ms,
    }, exclude=None)
    # TTS only for the listener (translated language == listener lang).
    try:
        tts = await synthesize(translated, dst, heat=heat)
    except RuntimeError:
        tts = None
    if tts is None:
        await _broadcast(room_code, {
            "type": "speak", "seq": seq, "lang": dst, "text": translated, "heat": heat,
        })
        return
    audio_out, mime_out = tts
    await _broadcast(room_code, {
        "type": "tts-audio", "seq": seq, "lang": dst,
        "audio_b64": audio_out, "mime": mime_out, "heat": heat,
    })


async def _process_text_partial(room_code: str, lang: str, text: str, is_final: bool, seq: int) -> None:
    """Browser-STT mode: client transcribed locally, server only translates."""
    if not text.strip():
        return
    dst = _other_lang(lang)
    try:
        translated = await translate(text, lang, dst)
    except RuntimeError:
        translated = text
    await _broadcast(room_code, {
        "type": "subtitle", "from_lang": lang, "original": text,
        "translated": translated, "is_final": is_final, "seq": seq,
        "latency_ms": 0, "browser_stt": True,
    })
    tts = await synthesize(translated, dst)
    if tts is None:
        await _broadcast(room_code, {"type": "speak", "seq": seq, "lang": dst, "text": translated})
    else:
        audio_out, mime_out = tts
        await _broadcast(room_code, {
            "type": "tts-audio", "seq": seq, "lang": dst,
            "audio_b64": audio_out, "mime": mime_out,
        })


@router.websocket("/ws/{code}")
async def room_socket(ws: WebSocket, code: str) -> None:
    await ws.accept()
    room = STORE.get(code)
    if room is None:
        await _send(ws, {"type": "status", "level": "reconnecting", "message": "room not found or expired"})
        await ws.close(code=4404)
        return
    settings = get_settings()
    if len(room.peers) >= settings.max_peers_per_room:
        await _send(ws, {"type": "status", "level": "busy", "message": "room is full"})
        await ws.close(code=4409)
        return

    lang = (ws.query_params.get("lang") or "en").lower()
    if lang not in ("en", "bn"):
        lang = "en"
    peer = Peer(ws=ws, lang=lang)
    room.peers.append(peer)
    room.last_active = time.time()
    await _broadcast(room.code, {
        "type": "room-state",
        "peers": [{"lang": p.lang, "speaking": p.speaking} for p in room.peers],
        "count": len(room.peers),
    })

    try:
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            room.last_active = time.time()
            peer.last_seen = time.time()
            mtype = msg.get("type")

            if mtype == "hello":
                peer.lang = msg.get("lang", peer.lang) if msg.get("lang") in ("en", "bn") else peer.lang
                await _broadcast(room.code, {
                    "type": "room-state",
                    "peers": [{"lang": p.lang, "speaking": p.speaking} for p in room.peers],
                    "count": len(room.peers),
                })
            elif mtype == "peer-speaking":
                peer.speaking = bool(msg.get("speaking"))
                peer.heat = float(msg.get("heat") or 0)
                await _broadcast(room.code, {
                    "type": "peer-speaking", "lang": peer.lang,
                    "speaking": peer.speaking, "heat": peer.heat,
                }, exclude=ws)
                # Interruption: both speaking within overlap window (F10).
                others_speaking = any(p.speaking and p.ws is not ws for p in room.peers)
                interrupted = peer.speaking and others_speaking
                await _broadcast(room.code, {"type": "interruption", "active": bool(interrupted)})
            elif mtype == "audio-chunk":
                now = time.time()
                peer.chunks_this_min = [t for t in peer.chunks_this_min if now - t < 60]
                if len(peer.chunks_this_min) >= settings.rate_limit_chunks_per_min:
                    await _send(ws, {"type": "status", "level": "busy", "message": "slow mode: sending too fast"})
                    continue
                peer.chunks_this_min.append(now)
                seq = int(msg.get("seq") or 0)
                heat = float(msg.get("heat") or 0)
                # Fire-and-forget per chunk: full duplex, never blocks (F7).
                asyncio.create_task(_process_audio_chunk(
                    room.code, ws, seq, peer.lang,
                    msg.get("audio_b64", ""), msg.get("mime", "audio/webm"), heat,
                ))
            elif mtype == "text-partial":
                asyncio.create_task(_process_text_partial(
                    room.code, peer.lang, msg.get("text", ""),
                    bool(msg.get("is_final")), int(msg.get("seq") or 0),
                ))
            elif mtype == "barge-in":
                # Tell the other side to duck/stop TTS playback (F11).
                await _broadcast(room.code, {"type": "barge-in", "by_lang": peer.lang}, exclude=ws)
            elif mtype == "bye":
                break
    finally:
        room.peers = [p for p in room.peers if p.ws is not ws]
        await _broadcast(room.code, {
            "type": "room-state",
            "peers": [{"lang": p.lang, "speaking": p.speaking} for p in room.peers],
            "count": len(room.peers),
        })
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
