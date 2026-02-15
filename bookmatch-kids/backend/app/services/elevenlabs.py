import os
import json
import requests
from functools import lru_cache
from typing import Optional

ELEVEN_BASE = "https://api.elevenlabs.io/v1"


def _api_key() -> Optional[str]:
    return os.getenv("ELEVENLABS_API_KEY")


@lru_cache(maxsize=1)
def _resolve_voice_id() -> Optional[str]:
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    if voice_id:
        return voice_id

    voice_name = os.getenv("ELEVENLABS_VOICE_NAME")
    if not voice_name:
        return None

    api_key = _api_key()
    if not api_key:
        return None

    resp = requests.get(
        f"{ELEVEN_BASE}/voices",
        headers={"xi-api-key": api_key},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    for voice in data.get("voices", []):
        if voice.get("name", "").lower() == voice_name.lower():
            return voice.get("voice_id")

    return None


def text_to_speech(text: str) -> bytes:
    api_key = _api_key()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not set")

    voice_id = _resolve_voice_id()
    if not voice_id:
        raise RuntimeError("ELEVENLABS_VOICE_ID or ELEVENLABS_VOICE_NAME not set or not found")

    payload = {
        "text": text,
        "model_id": os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2"),
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 0.7,
        },
    }

    resp = requests.post(
        f"{ELEVEN_BASE}/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": api_key,
            "accept": "audio/mpeg",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.content
