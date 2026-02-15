import os
from typing import Any, Dict, List
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

import requests


GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes"
BOOKCOVER_API_URL = "https://bookcover.longitood.com"


def _normalize_cover_url(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http://"):
        url = "https://" + url[len("http://") :]
    try:
        parsed = urlparse(url)
        query = dict(parse_qsl(parsed.query))
        query["zoom"] = "2"
        rebuilt = parsed._replace(query=urlencode(query))
        return urlunparse(rebuilt)
    except Exception:
        if "?" in url:
            return url + "&zoom=2"
        return url + "?zoom=2"


def _volume_to_book(volume: Dict[str, Any]) -> Dict[str, Any]:
    info = volume.get("volumeInfo", {}) or {}
    title = info.get("title") or "Unknown Title"
    authors = info.get("authors") or []
    author = ", ".join(authors) if authors else "Unknown Author"
    description = info.get("description") or ""
    categories = info.get("categories") or []
    tags = [str(c).lower() for c in categories if c]
    language = info.get("language") or "English"
    page_count = info.get("pageCount") or 0

    format_hint = "chapter"
    if page_count and page_count <= 40:
        format_hint = "picture"
    elif page_count and page_count <= 80:
        format_hint = "graphic"

    image_links = info.get("imageLinks") or {}
    cover_url = (
        image_links.get("extraLarge")
        or image_links.get("large")
        or image_links.get("medium")
        or image_links.get("small")
        or image_links.get("thumbnail")
        or image_links.get("smallThumbnail")
        or ""
    )
    cover_url = _normalize_cover_url(cover_url)

    isbn = ""
    for ident in info.get("industryIdentifiers") or []:
        if ident.get("type") in ("ISBN_13", "ISBN_10"):
            isbn = ident.get("identifier") or ""
            if isbn:
                break

    return {
        "title": title,
        "author": author,
        "description": description,
        "tags": tags,
        "age_min": None,
        "age_max": None,
        "reading_level": "unknown",
        "language": language,
        "format": format_hint,
        "cover_url": cover_url,
        "isbn": isbn,
        "source": "google",
        "source_id": volume.get("id"),
    }


def search_google_books(query: str, max_results: int = 5, language: str | None = None) -> List[Dict[str, Any]]:
    if not query:
        return []

    params: Dict[str, Any] = {
        "q": query,
        "maxResults": max_results,
        "printType": "books",
        "fields": "items(id,volumeInfo(title,authors,description,categories,language,pageCount,imageLinks,industryIdentifiers))",
    }
    api_key = os.getenv("GOOGLE_BOOKS_API_KEY")
    if api_key:
        params["key"] = api_key
    if language:
        params["langRestrict"] = language[:2].lower()

    resp = requests.get(GOOGLE_BOOKS_ENDPOINT, params=params, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", []) or []
    return [_volume_to_book(item) for item in items if item]


def _bookcover_lookup(title: str, author: str | None = None, isbn: str | None = None) -> str:
    base_url = os.getenv("BOOKCOVER_API_URL", BOOKCOVER_API_URL).strip().rstrip("/")
    if not base_url:
        return ""
    try:
        if isbn:
            resp = requests.get(f"{base_url}/bookcover/{isbn}", timeout=20)
        elif title and author:
            resp = requests.get(
                f"{base_url}/bookcover",
                params={"book_title": title, "author_name": author},
                timeout=20,
            )
        else:
            return ""
        if not resp.ok:
            return ""
        data = resp.json()
        url = data.get("url") if isinstance(data, dict) else ""
        return _normalize_cover_url(url or "")
    except Exception:
        return ""


def fetch_cover_url(title: str, author: str | None = None, isbn: str | None = None) -> str:
    if not title and not isbn:
        return ""
    parts = []
    if isbn:
        parts.append(f"isbn:{isbn}")
    if title:
        parts.append(f"intitle:{title}")
    if author:
        parts.append(f"inauthor:{author}")
    query = " ".join(parts).strip()
    try:
        if os.getenv("BOOKCOVER_API_ENABLED", "false").lower() in {"1", "true", "yes"}:
            url = _bookcover_lookup(title=title, author=author, isbn=isbn)
            if url:
                return url
        results = search_google_books(query, max_results=1)
    except Exception:
        return ""
    if not results:
        return ""
    return results[0].get("cover_url") or ""
