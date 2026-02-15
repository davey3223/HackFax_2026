import json
import os
import re
from typing import Dict, Any

import requests


GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

KEYWORD_TAGS = {
    "space": "space",
    "planet": "space",
    "rocket": "space",
    "astronaut": "space",
    "animal": "animals",
    "dog": "animals",
    "cat": "animals",
    "dinosaur": "animals",
    "mystery": "mystery",
    "detective": "mystery",
    "sports": "sports",
    "soccer": "sports",
    "basketball": "sports",
    "baseball": "sports",
    "magic": "fantasy",
    "dragon": "fantasy",
    "fairy": "fantasy",
    "robot": "science",
    "science": "science",
    "history": "history",
}

FORMAT_WORDS = {
    "picture": "picture",
    "chapter": "chapter",
    "graphic": "graphic",
    "comic": "graphic",
}

LANG_WORDS = {
    "spanish": "Spanish",
    "english": "English",
    "bilingual": "Bilingual",
}


def _fallback_parse(text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    lowered = text.lower()
    tags = set()
    keywords = set()

    for word, tag in KEYWORD_TAGS.items():
        if word in lowered:
            tags.add(tag)
            keywords.add(word)

    fmt = meta.get("format")
    for word, val in FORMAT_WORDS.items():
        if word in lowered:
            fmt = val

    lang = meta.get("language")
    for word, val in LANG_WORDS.items():
        if word in lowered:
            lang = val

    age = meta.get("age")
    age_match = re.search(r"\b(\d{1,2})\s*(years|yrs|yo|y/o)?\b", lowered)
    if age_match:
        try:
            age = int(age_match.group(1))
        except ValueError:
            pass

    return {
        "age": age,
        "language": lang,
        "format": fmt,
        "tags": sorted(tags),
        "keywords": sorted(keywords),
    }


def _gemini_parse(text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    system_prompt = (
        "You are a JSON-only parser for kid book requests. "
        "Return ONLY JSON with keys: age (number or null), language (string or null), "
        "format (picture|chapter|graphic|any|null), tags (array of strings), keywords (array of strings)."
    )
    user_prompt = {
        "text": text,
        "meta": meta,
    }

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": system_prompt}]},
            {"role": "user", "parts": [{"text": json.dumps(user_prompt)}]},
        ]
    }

    resp = requests.post(
        GEMINI_ENDPOINT,
        params={"key": api_key},
        json=payload,
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()

    text_out = ""
    try:
        text_out = data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as exc:
        raise RuntimeError("Unexpected Gemini response") from exc

    text_out = text_out.strip()
    if text_out.startswith("```"):
        text_out = re.sub(r"^```(json)?", "", text_out).strip()
        text_out = re.sub(r"```$", "", text_out).strip()

    return json.loads(text_out)


def parse_preferences(text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return _gemini_parse(text, meta)
    except Exception:
        return _fallback_parse(text, meta)
