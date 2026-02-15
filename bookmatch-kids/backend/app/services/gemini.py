import json
import os
import re
import time
import hashlib
from typing import Dict, Any

import requests


DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_VERSION = os.getenv("GEMINI_API_VERSION", "v1")
_CACHE: dict[str, dict] = {}
_CACHE_TTL_SECONDS = 90


def _endpoint(model: str | None = None, version: str | None = None) -> str:
    use_model = model or os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    use_version = version or DEFAULT_GEMINI_VERSION
    return f"https://generativelanguage.googleapis.com/{use_version}/models/{use_model}:generateContent"


def _cache_key(payload: Dict[str, Any], model: str | None, version: str) -> str:
    raw = json.dumps({"payload": payload, "model": model, "version": version}, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _from_cache(key: str) -> Dict[str, Any] | None:
    item = _CACHE.get(key)
    if not item:
        return None
    if time.time() - item["ts"] > _CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return item["data"]


def _save_cache(key: str, data: Dict[str, Any]) -> None:
    _CACHE[key] = {"ts": time.time(), "data": data}


def _post_gemini(payload: Dict[str, Any], model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    versions = [DEFAULT_GEMINI_VERSION, "v1beta"]
    tried = []
    last_err = None
    for version in versions:
        if version in tried:
            continue
        tried.append(version)
        cache_key = _cache_key(payload, model, version)
        cached = _from_cache(cache_key)
        if cached:
            return cached
        try:
            for attempt in range(3):
                resp = requests.post(
                    _endpoint(model, version=version),
                    params={"key": api_key},
                    json=payload,
                    timeout=20,
                )
                if resp.status_code == 429:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                _save_cache(cache_key, data)
                return data
            resp.raise_for_status()
        except requests.HTTPError as exc:
            last_err = exc
            if resp.status_code == 404:
                if model:
                    # Model not found: fall back to server default
                    model = None
                    continue
                continue
            raise
        except Exception as exc:
            last_err = exc
            break
    if last_err:
        raise last_err
    raise RuntimeError("Gemini request failed")


def list_models() -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    versions = [DEFAULT_GEMINI_VERSION, "v1beta"]
    tried = []
    last_err = None
    for version in versions:
        if version in tried:
            continue
        tried.append(version)
        try:
            resp = requests.get(
                f"https://generativelanguage.googleapis.com/{version}/models",
                params={"key": api_key},
                timeout=20,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as exc:
            last_err = exc
            if resp.status_code == 404:
                continue
            raise
        except Exception as exc:
            last_err = exc
            break
    if last_err:
        raise last_err
    raise RuntimeError("Gemini model list failed")


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
        "tone": None,
        "themes": [],
        "series": None,
        "length": None,
    }


def _gemini_parse(text: str, meta: Dict[str, Any], model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    system_prompt = (
        "You are a JSON-only parser for kid book requests. "
        "Return ONLY JSON with keys: age (number or null), language (string or null), "
        "format (picture|chapter|graphic|any|null), tags (array of strings), keywords (array of strings), "
        "tone (string or null), themes (array of strings), series (string or null), length (string or null)."
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

    data = _post_gemini(payload, model=model)

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


def parse_preferences_with_meta(
    text: str,
    meta: Dict[str, Any],
    model: str | None = None,
    use_gemini: bool = True,
) -> Dict[str, Any]:
    if not use_gemini:
        return {
            "parsed": _fallback_parse(text, meta),
            "gemini_used": False,
            "gemini_error": "disabled",
        }
    try:
        return {
            "parsed": _gemini_parse(text, meta, model),
            "gemini_used": True,
            "gemini_error": None,
        }
    except Exception as exc:
        return {
            "parsed": _fallback_parse(text, meta),
            "gemini_used": False,
            "gemini_error": str(exc),
        }


def parse_preferences(text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    return parse_preferences_with_meta(text, meta)["parsed"]


def explain_matches(message: str, prefs: Dict[str, Any], books: list, model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        titles = ", ".join([b.get("title", "") for b in books[:3]]) or "some great picks"
        return {
            "response": f"I picked {titles} because they match your interests and age.",
        }

    try:
        prompt = (
            "You are a friendly helper for kids picking books. "
            "Given the request, preferences, and matched books, respond in 2-3 sentences. "
            "Mention 2-3 book titles. Keep it simple. Return only plain text."
        )
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]},
                {"role": "user", "parts": [{"text": json.dumps({"message": message, "prefs": prefs, "books": books})}]},
            ]
        }
        data = _post_gemini(payload, model=model)
        text_out = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return {"response": text_out}
    except Exception:
        titles = ", ".join([b.get("title", "") for b in books[:3]]) or "some great picks"
        return {
            "response": f"I picked {titles} because they match your interests and age.",
        }


def summarize_book(book: Dict[str, Any], model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        desc = book.get("description") or ""
        summary = desc.split(".")[0].strip() if desc else f"{book.get('title', '')} by {book.get('author', '')}"
        return {"summary": summary}

    try:
        prompt = (
            "Summarize this kid's book in 2-3 friendly sentences for a parent. "
            "Return only plain text."
        )
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]},
                {"role": "user", "parts": [{"text": json.dumps(book)}]},
            ]
        }
        data = _post_gemini(payload, model=model)
        text_out = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return {"summary": text_out}
    except Exception:
        desc = book.get("description") or ""
        summary = desc.split(".")[0].strip() if desc else f"{book.get('title', '')} by {book.get('author', '')}"
        return {"summary": summary}


def concierge_reply(message: str, history: list, model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {
            "reply": "Tell me the age, favorite topics, and format (picture, chapter, graphic), and I can suggest books.",
            "suggested_queries": ["funny animals for age 6", "space adventure chapter book", "mystery graphic novel"],
        }

    try:
        system_prompt = (
            "You are a friendly book concierge for kids. Keep replies short. "
            "Suggest 2-3 example queries. If possible, infer preferences. "
            "Return JSON only with keys: reply, suggested_queries."
        )
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": system_prompt}]},
                {"role": "user", "parts": [{"text": json.dumps({"message": message, "history": history})}]},
            ]
        }
        data = _post_gemini(payload, model=model)
        text_out = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        if text_out.startswith("```"):
            text_out = re.sub(r"^```(json)?", "", text_out).strip()
            text_out = re.sub(r"```$", "", text_out).strip()
        return json.loads(text_out)
    except Exception:
        return {
            "reply": "Tell me the age, favorite topics, and format (picture, chapter, graphic), and I can suggest books.",
            "suggested_queries": ["funny animals for age 6", "space adventure chapter book", "mystery graphic novel"],
        }


def test_gemini(model: str | None = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": "Say OK in one word."}]},
        ]
    }
    data = _post_gemini(payload, model=model)
    text_out = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    return {"reply": text_out}
