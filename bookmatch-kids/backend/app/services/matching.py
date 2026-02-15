from typing import List, Dict, Any


def _score_book(book: Dict[str, Any], prefs: Dict[str, Any], query: str = "") -> float:
    score = 0.0

    age = prefs.get("age")
    if age is not None and book.get("age_min") is not None and book.get("age_max") is not None:
        if book["age_min"] <= age <= book["age_max"]:
            score += 3.0
        else:
            score -= 1.0

    language = prefs.get("language")
    if language and book.get("language"):
        if book["language"].lower() == language.lower():
            score += 2.0

    fmt = prefs.get("format")
    if fmt and fmt != "any" and book.get("format"):
        if book["format"].lower() == fmt.lower():
            score += 2.0

    tags = set([t.lower() for t in prefs.get("tags", [])])
    book_tags = set([t.lower() for t in book.get("tags", [])])
    if tags and book_tags:
        overlap = tags.intersection(book_tags)
        score += 1.5 * len(overlap)

    keywords = " ".join(prefs.get("keywords", [])).lower()
    combined = f"{book.get('title','')} {book.get('description','')}".lower()
    for word in set((keywords + " " + query).split()):
        if len(word) > 2 and word in combined:
            score += 0.5

    return score


def rank_books(books: List[Dict[str, Any]], prefs: Dict[str, Any], query: str = "") -> List[Dict[str, Any]]:
    ranked = []
    for book in books:
        score = _score_book(book, prefs, query=query)
        ranked.append({**book, "score": score})

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked
