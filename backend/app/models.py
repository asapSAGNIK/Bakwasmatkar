"""Shared pydantic models for REST + WebSocket protocol."""

from typing import Literal

from pydantic import BaseModel, Field

Lang = Literal["en", "bn"]


class CreateRoomResponse(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9]{6}$")
    ws_url_path: str = "/ws/{code}"


class JoinRoomRequest(BaseModel):
    lang: Lang


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    stt: str
    translate: str
    tts: str
    rooms: int


# ---- WebSocket protocol (client -> server) ----
# {type:"hello", lang, name?}
# {type:"audio-chunk", seq, lang, audio_b64, mime, heat, speaking, ts}
# {type:"barge-in", ts}
# {type:"bye"}

# ---- WebSocket protocol (server -> client) ----
# {type:"room-state", peers:[{lang, speaking}], you}
# {type:"subtitle", from_lang, original, translated, is_final, seq, latency_ms}
# {type:"tts-audio", seq, lang, audio_b64, mime, text_len}
# {type:"peer-speaking", lang, speaking, heat}
# {type:"interruption", active: bool}
# {type:"status", level:"info|busy|reconnecting|slow", message}
