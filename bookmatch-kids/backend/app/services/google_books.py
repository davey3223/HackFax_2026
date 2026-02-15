import os
from typing import Any, Dict, List

import requests


GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes"


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
    cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail") or ""

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
