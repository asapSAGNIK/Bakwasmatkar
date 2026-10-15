"""REST: room create/join + health. No auth (PRD F1)."""

import time

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..models import CreateRoomResponse, HealthResponse, JoinRoomRequest
from ..pipeline.stt import active_stt_provider
from ..pipeline.translate import active_translate_provider
from ..pipeline.tts import active_tts_provider
from ..rooms import STORE

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        stt=active_stt_provider(),
        translate=active_translate_provider(),
        tts=active_tts_provider(),
        rooms=len(STORE.rooms),
    )


@router.post("/api/rooms", response_model=CreateRoomResponse)
def create_room() -> CreateRoomResponse:
    room = STORE.create()
    return CreateRoomResponse(code=room.code, ws_url_path=f"/ws/{room.code}")


@router.post("/api/rooms/{code}/join")
def join_room(code: str, body: JoinRoomRequest) -> dict:
    room = STORE.get(code)
    if room is None:
        raise HTTPException(404, "room not found or expired")
    if len(room.peers) >= get_settings().max_peers_per_room:
        raise HTTPException(409, "room is full (2 participants max)")
    room.last_active = time.time()
    return {
        "code": room.code,
        "your_lang": body.lang,
        "ws_url_path": f"/ws/{room.code}?lang={body.lang}",
        "stt_provider": active_stt_provider(),
        "tts_provider": active_tts_provider(),
    }
