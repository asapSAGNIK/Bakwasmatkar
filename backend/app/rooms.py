"""In-memory room registry. No persistence (privacy requirement)."""

import secrets
import string
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from .config import get_settings

CODE_ALPHABET = string.ascii_uppercase + string.digits


def new_code(length: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


@dataclass
class Peer:
    ws: WebSocket
    lang: str  # "en" | "bn"
    name: str = ""
    speaking: bool = False
    heat: float = 0.0
    last_seen: float = field(default_factory=time.time)
    chunks_this_min: list[float] = field(default_factory=list)


@dataclass
class Room:
    code: str
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    peers: list[Peer] = field(default_factory=list)
    # overlap tracking for interruption badge
    overlap_since: float | None = None


class RoomStore:
    """Single-process store. Sufficient for 2-peer rooms on Render free."""

    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def create(self) -> Room:
        settings = get_settings()
        self.evict_expired()
        if len(self.rooms) >= settings.max_rooms:
            self.evict_expired(force_oldest=True)
        for _ in range(10):
            code = new_code()
            if code not in self.rooms:
                room = Room(code=code)
                self.rooms[code] = room
                return room
        raise RuntimeError("could not allocate room code")

    def get(self, code: str) -> Room | None:
        room = self.rooms.get(code.upper().strip())
        if room and time.time() - room.last_active > get_settings().room_ttl_seconds:
            self.rooms.pop(room.code, None)
            return None
        return room

    def evict_expired(self, force_oldest: bool = False) -> None:
        ttl = get_settings().room_ttl_seconds
        now = time.time()
        expired = [c for c, r in self.rooms.items() if now - r.last_active > ttl]
        for c in expired:
            self.rooms.pop(c, None)
        if force_oldest and self.rooms:
            oldest = min(self.rooms.values(), key=lambda r: r.last_active)
            self.rooms.pop(oldest.code, None)


STORE = RoomStore()
