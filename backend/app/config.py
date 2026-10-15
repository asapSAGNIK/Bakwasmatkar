"""Centralised env-driven configuration. All secrets optional ($0 fallback)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "live-argument-translator"
    env: str = "production"  # local | production
    log_level: str = "INFO"

    # CORS: comma-separated origins, e.g. "https://xxx.vercel.app"
    cors_origins: str = "*"

    # Room lifecycle
    room_ttl_seconds: int = 2 * 60 * 60  # 2h inactivity eviction
    max_rooms: int = 500
    max_peers_per_room: int = 2

    # Providers: "auto" | "groq" | "browser" / "edge" | "mymemory"
    stt_provider: str = "auto"
    translate_provider: str = "auto"
    tts_provider: str = "auto"

    groq_api_key: str = ""
    groq_stt_model: str = "whisper-large-v3-turbo"
    groq_translate_model: str = "llama-3.1-8b-instant"

    # TTS voices (Edge-TTS, no key required)
    tts_voice_en: str = "en-US-AriaNeural"
    tts_voice_bn: str = "bn-IN-TanishaaNeural"

    # Safety / abuse
    max_audio_chunk_bytes: int = 512 * 1024  # 512KB per chunk (~1s opus)
    rate_limit_chunks_per_min: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()
