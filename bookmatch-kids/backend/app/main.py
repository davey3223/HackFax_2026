from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from dotenv import load_dotenv

from .db import get_db
from .models import ParseRequest, CreateRequest, UpdateStatus
from .services.gemini import parse_preferences
from .services.matching import rank_books

load_dotenv()

app = FastAPI(title="BookMatch Kids")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialize(doc):
    if not doc:
        return doc
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out["_id"])
        del out["_id"]
    return out


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/admin/config-status")
def config_status():
    import os

    missing = []
    if not os.getenv("MONGODB_URI"):
        missing.append("MONGODB_URI")
    if not os.getenv("GEMINI_API_KEY"):
        missing.append("GEMINI_API_KEY")
    if not os.getenv("ELEVENLABS_API_KEY"):
        missing.append("ELEVENLABS_API_KEY")
    if not os.getenv("VITE_API_BASE_URL"):
        missing.append("VITE_API_BASE_URL")

    return {
        "missing": missing,
        "configured": len(missing) == 0,
    }


@app.post("/api/parse")
def parse(req: ParseRequest):
    meta = {"age": req.age, "language": req.language, "format": req.format}
    parsed = parse_preferences(req.text, meta)
    return parsed


@app.get("/api/books/search")
def search_books(
    age: Optional[int] = None,
    language: Optional[str] = None,
    tags: Optional[str] = None,
    format: Optional[str] = Query(default=None, alias="format"),
    q: Optional[str] = None,
):
    db = get_db()
    books = list(db.books.find({}))
    inventory = list(db.inventory.find({"qty_available": {"$gt": 0}}))
    inventory_ids = {str(item["book_id"]) for item in inventory}

    filtered = []
    for book in books:
        if str(book["_id"]) not in inventory_ids:
            continue
        filtered.append(book)

    pref_tags: List[str] = []
    if tags:
        pref_tags = [t.strip() for t in tags.split(",") if t.strip()]

    prefs = {
        "age": age,
        "language": language,
        "format": format,
        "tags": pref_tags,
        "keywords": [],
    }

    ranked = rank_books(filtered, prefs, query=q or "")
    top = ranked[:5]
    return [
        {
            **_serialize(b),
            "score": round(b["score"], 2),
        }
        for b in top
    ]


@app.post("/api/requests")
def create_request(req: CreateRequest):
    db = get_db()
    doc = {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "raw_text": req.raw_text,
        "parsed_preferences": req.parsed_preferences,
        "matched": [m.dict() for m in req.matched],
        "location_id": req.location_id or "main",
        "status": "new",
    }
    result = db.requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@app.get("/api/admin/requests")
def list_requests(status: Optional[str] = None):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    items = list(db.requests.find(query).sort("created_at", -1))
    return [_serialize(i) for i in items]


@app.post("/api/admin/requests/{request_id}/status")
def update_status(request_id: str, payload: UpdateStatus):
    db = get_db()
    if payload.status not in {"approved", "picked", "packed", "distributed", "new"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    result = db.requests.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {"status": payload.status}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    doc = db.requests.find_one({"_id": ObjectId(request_id)})
    return _serialize(doc)


@app.get("/api/admin/requests/{request_id}/picklist")
def picklist(request_id: str):
    db = get_db()
    req = db.requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    matched = req.get("matched", [])
    book_ids = [ObjectId(m["book_id"]) for m in matched if "book_id" in m]
    books = list(db.books.find({"_id": {"$in": book_ids}}))

    lines = []
    for book in books:
        lines.append(f"{book.get('title')} - {book.get('author')} ({book.get('format')})")

    return {
        "request_id": str(req["_id"]),
        "location_id": req.get("location_id", "main"),
        "lines": lines,
    }
