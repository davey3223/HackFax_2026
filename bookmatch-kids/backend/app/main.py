from datetime import datetime, timedelta
from typing import Optional, List
import csv
import io

from fastapi import FastAPI, Query, HTTPException, Header, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from .config import load_env, env_debug, write_env_var

from .db import get_db
from .models import ParseRequest, CreateRequest, UpdateStatus
from .auth import (
    authenticate,
    create_session,
    create_user,
    get_user_by_token,
    staff_signup_allowed,
    ensure_demo_users,
    create_magic_token,
    consume_magic_token,
)
from .services.gemini import (
    parse_preferences,
    summarize_book,
    concierge_reply,
    explain_matches,
    parse_preferences_with_meta,
    test_gemini,
    list_models,
)
from .services.matching import rank_books
from .services.elevenlabs import text_to_speech
from .services.google_books import search_google_books

load_env()
ensure_demo_users()

app = FastAPI(title="BookMatch Kids")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    return get_user_by_token(token)


def _require_staff(user=Depends(_get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    if user.get("role") not in {"staff", "volunteer"}:
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


def _serialize(doc):
    if not doc:
        return doc
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out["_id"])
        del out["_id"]
    return out


def _build_google_query(text: str | None, tags: List[str], keywords: List[str]) -> str:
    parts: List[str] = []
    if text:
        parts.append(text)
    parts.extend(tags)
    parts.extend(keywords)
    seen = set()
    unique = []
    for part in " ".join(parts).split():
        if part.lower() in seen:
            continue
        seen.add(part.lower())
        unique.append(part)
    return " ".join(unique).strip()


def _import_google_books(db, query: str, language: str | None, limit: int) -> List[dict]:
    import os

    if not query or limit <= 0:
        return []
    if os.getenv("GOOGLE_BOOKS_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return []

    try:
        results = search_google_books(query, max_results=limit, language=language)
    except Exception:
        return []

    imported = []
    for book in results:
        source_id = book.get("source_id")
        if not source_id:
            continue
        existing = db.books.find_one({"source": "google", "source_id": source_id})
        if existing:
            if not db.inventory.find_one({"book_id": existing["_id"]}):
                db.inventory.insert_one(
                    {"book_id": existing["_id"], "location_id": "main", "qty_available": 1}
                )
            imported.append(existing)
            continue
        result = db.books.insert_one(book)
        book["_id"] = result.inserted_id
        db.inventory.insert_one(
            {"book_id": result.inserted_id, "location_id": "main", "qty_available": 1}
        )
        imported.append(book)
    return imported


def _parse_csv_inventory(text: str) -> List[dict]:
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        if not row:
            continue
        normalized = {k.strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
        rows.append(normalized)
    return rows


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/admin/config-status", dependencies=[Depends(_require_staff)])
def config_status():
    import os

    missing = []
    if not os.getenv("MONGODB_URI"):
        missing.append("MONGODB_URI")
    if not os.getenv("GEMINI_API_KEY"):
        missing.append("GEMINI_API_KEY")
    if not os.getenv("ELEVENLABS_API_KEY"):
        missing.append("ELEVENLABS_API_KEY")
    if os.getenv("ELEVENLABS_API_KEY") and not (os.getenv("ELEVENLABS_VOICE_ID") or os.getenv("ELEVENLABS_VOICE_NAME")):
        missing.append("ELEVENLABS_VOICE_ID_or_NAME")
    if not os.getenv("VITE_API_BASE_URL"):
        missing.append("VITE_API_BASE_URL")

    return {
        "missing": missing,
        "configured": len(missing) == 0,
    }


@app.get("/api/admin/keys-status", dependencies=[Depends(_require_staff)])
def keys_status():
    import os

    return {
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "elevenlabs_configured": bool(os.getenv("ELEVENLABS_API_KEY")),
        "elevenlabs_voice_configured": bool(os.getenv("ELEVENLABS_VOICE_ID") or os.getenv("ELEVENLABS_VOICE_NAME")),
        "mongodb_configured": bool(os.getenv("MONGODB_URI")),
    }


@app.get("/api/admin/env-debug", dependencies=[Depends(_require_staff)])
def env_debug_info():
    return env_debug()


@app.post("/api/admin/set-mongodb-uri", dependencies=[Depends(_require_staff)])
def set_mongodb_uri(payload: dict):
    uri = payload.get("mongodb_uri")
    if not uri or not isinstance(uri, str):
        raise HTTPException(status_code=400, detail="mongodb_uri required")
    result = write_env_var("MONGODB_URI", uri.strip())
    return {"ok": True, "path": result.get("path")}


@app.post("/api/auth/register")
def register(payload: dict):
    email = (payload.get("email") or "").strip().lower()
    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    role = (payload.get("role") or "parent").strip().lower()
    invite_code = payload.get("invite_code")
    if not email or not name or not password:
        raise HTTPException(status_code=400, detail="name, email, password required")
    if role in {"staff", "volunteer"} and not staff_signup_allowed(invite_code):
        raise HTTPException(status_code=403, detail="Invalid staff invite code")
    if role not in {"parent", "staff", "volunteer"}:
        role = "parent"
    try:
        user = create_user(email, name, password, role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    token = create_session(user["_id"])
    return {
        "token": token,
        "user": {"id": str(user["_id"]), "email": user["email"], "name": user["name"], "role": user["role"]},
    }


@app.post("/api/auth/login")
def login(payload: dict):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")
    user = authenticate(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(user["_id"])
    return {
        "token": token,
        "user": {"id": str(user["_id"]), "email": user["email"], "name": user["name"], "role": user["role"]},
    }


@app.post("/api/auth/demo")
def demo_login():
    import os

    if os.getenv("DEMO_LOGIN", "false").lower() not in {"1", "true", "yes"}:
        raise HTTPException(status_code=403, detail="Demo login disabled")
    email = os.getenv("DEMO_STAFF_EMAIL", "demo@bookmatch.local").lower()
    user = authenticate(email, os.getenv("DEMO_STAFF_PASSWORD", "demo1234"))
    if not user:
        raise HTTPException(status_code=401, detail="Demo user missing")
    token = create_session(user["_id"])
    return {
        "token": token,
        "user": {"id": str(user["_id"]), "email": user["email"], "name": user["name"], "role": user["role"]},
    }


@app.get("/api/auth/me")
def me(user=Depends(_get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"id": str(user["_id"]), "email": user["email"], "name": user["name"], "role": user["role"]}


@app.post("/api/auth/magic-link", dependencies=[Depends(_require_staff)])
def magic_link(payload: dict):
    role = payload.get("role") or "volunteer"
    if role not in {"volunteer"}:
        raise HTTPException(status_code=400, detail="role must be volunteer")
    token = create_magic_token(role=role)
    frontend = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
    return {"url": f"{frontend}/?magic={token}"}


@app.post("/api/auth/magic-login")
def magic_login(payload: dict):
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    user = consume_magic_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    session = create_session(user["_id"])
    return {
        "token": session,
        "user": {"id": str(user["_id"]), "email": user["email"], "name": user["name"], "role": user["role"]},
    }


@app.get("/api/admin/gemini-test", dependencies=[Depends(_require_staff)])
def gemini_test(model: Optional[str] = None):
    try:
        result = test_gemini(model=model)
        return {"ok": True, **result}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/api/admin/gemini-models", dependencies=[Depends(_require_staff)])
def gemini_models():
    try:
        data = list_models()
        return {"ok": True, "models": data.get("models", data)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/admin/books/lookup", dependencies=[Depends(_require_staff)])
def lookup_books(payload: dict):
    ids = payload.get("book_ids") or []
    object_ids = []
    for raw_id in ids:
        try:
            object_ids.append(ObjectId(raw_id))
        except Exception:
            continue
    if not object_ids:
        return {"books": []}
    db = get_db()
    books = list(db.books.find({"_id": {"$in": object_ids}}))
    return {"books": [_serialize(b) for b in books]}


@app.get("/api/admin/books/search", dependencies=[Depends(_require_staff)])
def admin_search_books(q: Optional[str] = None, limit: int = 20):
    if not q:
        return {"books": []}
    db = get_db()
    regex = {"$regex": q, "$options": "i"}
    query = {"$or": [{"title": regex}, {"author": regex}, {"isbn": regex}]}
    books = list(db.books.find(query).limit(max(min(limit, 50), 1)))
    book_ids = [b["_id"] for b in books]
    inventory = list(db.inventory.find({"book_id": {"$in": book_ids}}))
    inventory_map = {}
    for item in inventory:
        key = str(item["book_id"])
        inventory_map.setdefault(key, []).append(
            {"location_id": item.get("location_id", "main"), "qty_available": item.get("qty_available", 0)}
        )
    serialized = []
    for book in books:
        out = _serialize(book)
        out["inventory"] = inventory_map.get(out["id"], [])
        serialized.append(out)
    return {"books": serialized}


@app.post("/api/admin/inventory/import", dependencies=[Depends(_require_staff)])
def import_inventory(payload: dict):
    csv_text = payload.get("csv") or ""
    if not csv_text.strip():
        raise HTTPException(status_code=400, detail="csv is required")
    location_id = payload.get("location_id") or "main"
    try:
        default_qty = int(payload.get("default_qty") or 1)
    except Exception:
        default_qty = 1

    rows = _parse_csv_inventory(csv_text)
    if not rows:
        raise HTTPException(status_code=400, detail="No rows found in CSV")

    db = get_db()
    inserted = 0
    updated = 0
    inventory_upserts = 0

    for row in rows:
        title = row.get("title") or ""
        author = row.get("author") or ""
        if not title:
            continue
        isbn = row.get("isbn") or ""
        tags_raw = row.get("tags") or ""
        tags = [t.strip().lower() for t in tags_raw.replace("|", ",").split(",") if t.strip()]
        try:
            age_min = int(row.get("age_min")) if row.get("age_min") else None
        except Exception:
            age_min = None
        try:
            age_max = int(row.get("age_max")) if row.get("age_max") else None
        except Exception:
            age_max = None
        reading_level = row.get("reading_level") or "unknown"
        language = row.get("language") or "English"
        fmt = row.get("format") or "chapter"
        cover_url = row.get("cover_url") or ""
        description = row.get("description") or ""

        book_doc = {
            "title": title,
            "author": author or "Unknown Author",
            "description": description,
            "tags": tags,
            "age_min": age_min,
            "age_max": age_max,
            "reading_level": reading_level,
            "language": language,
            "format": fmt,
            "cover_url": cover_url,
            "isbn": isbn,
            "source": row.get("source") or "manual",
        }

        existing = None
        if isbn:
            existing = db.books.find_one({"isbn": isbn})
        if not existing and author:
            existing = db.books.find_one({"title": title, "author": author})

        if existing:
            db.books.update_one({"_id": existing["_id"]}, {"$set": book_doc})
            book_id = existing["_id"]
            updated += 1
        else:
            result = db.books.insert_one(book_doc)
            book_id = result.inserted_id
            inserted += 1

        row_location = row.get("location_id") or location_id
        try:
            qty = int(row.get("qty_available")) if row.get("qty_available") else default_qty
        except Exception:
            qty = default_qty

        db.inventory.update_one(
            {"book_id": book_id, "location_id": row_location},
            {"$set": {"qty_available": max(qty, 0)}},
            upsert=True,
        )
        inventory_upserts += 1

    return {
        "ok": True,
        "inserted_books": inserted,
        "updated_books": updated,
        "inventory_upserts": inventory_upserts,
    }


@app.post("/api/admin/inventory/update", dependencies=[Depends(_require_staff)])
def update_inventory(payload: dict):
    book_id = payload.get("book_id")
    if not book_id:
        raise HTTPException(status_code=400, detail="book_id is required")
    try:
        obj_id = ObjectId(book_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid book_id") from exc

    location_id = payload.get("location_id") or "main"
    try:
        qty = int(payload.get("qty_available"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="qty_available must be a number") from exc

    db = get_db()
    db.inventory.update_one(
        {"book_id": obj_id, "location_id": location_id},
        {"$set": {"qty_available": max(qty, 0)}},
        upsert=True,
    )
    return {"ok": True}


@app.get("/api/admin/analytics", dependencies=[Depends(_require_staff)])
def analytics():
    db = get_db()
    requests = list(db.requests.find({}))
    status_counts = {}
    tag_counts = {}
    daily_counts = {}

    cutoff = datetime.utcnow() - timedelta(days=6)
    for req in requests:
        status = req.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

        prefs = req.get("parsed_preferences") or {}
        for tag in prefs.get("tags", []) or []:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

        created = req.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", ""))
            except Exception:
                dt = None
            if dt and dt >= cutoff:
                key = dt.strftime("%Y-%m-%d")
                daily_counts[key] = daily_counts.get(key, 0) + 1

    top_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    daily_series = []
    for i in range(7):
        day = (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_series.append({"date": day, "count": daily_counts.get(day, 0)})

    return {
        "status_counts": status_counts,
        "top_tags": [{"tag": t, "count": c} for t, c in top_tags],
        "daily": daily_series,
    }


@app.post("/api/admin/demo-seed", dependencies=[Depends(_require_staff)])
def demo_seed():
    db = get_db()
    books = list(db.books.find({}).limit(5))
    if not books:
        demo_books = [
            {
                "title": "Dragon Garden",
                "author": "M. Rivera",
                "description": "A gentle dragon helps a kid grow a magical garden.",
                "tags": ["dragons", "fantasy", "friendship"],
                "age_min": 6,
                "age_max": 9,
                "reading_level": "early",
                "language": "English",
                "format": "picture",
                "cover_url": "",
                "isbn": "999000000001",
                "source": "demo",
            },
            {
                "title": "Mystery at Maple Library",
                "author": "A. Chen",
                "description": "A clever kid solves a mystery in the library stacks.",
                "tags": ["mystery"],
                "age_min": 8,
                "age_max": 11,
                "reading_level": "middle",
                "language": "English",
                "format": "chapter",
                "cover_url": "",
                "isbn": "999000000002",
                "source": "demo",
            },
            {
                "title": "Rocket Pals",
                "author": "S. Patel",
                "description": "Friends build a rocket and learn teamwork.",
                "tags": ["space", "science"],
                "age_min": 7,
                "age_max": 10,
                "reading_level": "middle",
                "language": "English",
                "format": "chapter",
                "cover_url": "",
                "isbn": "999000000003",
                "source": "demo",
            },
        ]
        result = db.books.insert_many(demo_books)
        for book_id in result.inserted_ids:
            db.inventory.update_one(
                {"book_id": book_id, "location_id": "main"},
                {"$set": {"qty_available": 3}},
                upsert=True,
            )
        books = list(db.books.find({}).limit(5))

    demo_requests = [
        {
            "raw_text": "funny space adventure for age 7",
            "parsed_preferences": {"age": 7, "tags": ["space", "adventure"], "format": "chapter"},
        },
        {
            "raw_text": "mystery book for a 9 year old",
            "parsed_preferences": {"age": 9, "tags": ["mystery"], "format": "chapter"},
        },
        {
            "raw_text": "dragons and friendship picture book",
            "parsed_preferences": {"age": 6, "tags": ["dragons", "friendship"], "format": "picture"},
        },
    ]

    created = 0
    for demo in demo_requests:
        matched = [{"book_id": str(b["_id"]), "score": 1.0} for b in books[:3]]
        db.requests.insert_one(
            {
                "created_at": datetime.utcnow().isoformat() + "Z",
                "raw_text": demo["raw_text"],
                "parsed_preferences": demo["parsed_preferences"],
                "matched": matched,
                "location_id": "main",
                "status": "new",
                "requester_name": "Demo Parent",
                "requester_contact": "demo@bookmatch.local",
            }
        )
        created += 1
    return {"ok": True, "created": created}


@app.post("/api/parse")
def parse(req: ParseRequest):
    meta = {"age": req.age, "language": req.language, "format": req.format}
    parsed_info = parse_preferences_with_meta(req.text, meta, req.model)
    return parsed_info


@app.post("/api/chat")
def chat(req: ParseRequest, request: Request):
    user = _get_current_user(request.headers.get("authorization"))
    meta = {"age": req.age, "language": req.language, "format": req.format}
    parsed_info = parse_preferences_with_meta(req.text, meta, req.model)
    parsed = parsed_info["parsed"]

    db = get_db()
    books = list(db.books.find({}))
    inventory = list(db.inventory.find({"qty_available": {"$gt": 0}}))
    inventory_ids = {str(item["book_id"]) for item in inventory}

    filtered = []
    for book in books:
        if str(book["_id"]) not in inventory_ids:
            continue
        filtered.append(book)

    prefs = {
        "age": parsed.get("age"),
        "language": parsed.get("language"),
        "format": parsed.get("format"),
        "tags": parsed.get("tags", []),
        "keywords": parsed.get("keywords", []),
    }
    if len(filtered) < 5:
        google_query = _build_google_query(req.text, prefs.get("tags", []), prefs.get("keywords", []))
        imported = _import_google_books(db, google_query, prefs.get("language"), 5 - len(filtered))
        existing_ids = {str(b["_id"]) for b in filtered}
        for book in imported:
            if str(book["_id"]) not in existing_ids:
                filtered.append(book)
                existing_ids.add(str(book["_id"]))

    ranked = rank_books(filtered, prefs, query=req.text or "")
    top = ranked[:5]
    response = explain_matches(req.text, parsed, [_serialize(b) for b in top], model=req.model)
    if user:
        db = get_db()
        db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_recommendations": [str(b["_id"]) for b in top], "updated_at": datetime.utcnow()}},
        )

    return {
        "parsed": parsed,
        "gemini_used": parsed_info.get("gemini_used", False),
        "matches": [
            {**_serialize(b), "score": round(b["score"], 2)}
            for b in top
        ],
        "response": response.get("response"),
    }


@app.get("/api/users/me/recommendations")
def my_recommendations(user=Depends(_get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    db = get_db()
    ids = [ObjectId(rid) for rid in user.get("last_recommendations", []) if ObjectId.is_valid(rid)]
    if not ids:
        return {"books": []}
    books = list(db.books.find({"_id": {"$in": ids}}))
    return {"books": [_serialize(b) for b in books]}


@app.post("/api/books/summary")
def book_summary(payload: dict):
    db = get_db()
    book_id = payload.get("book_id")
    if not book_id:
        raise HTTPException(status_code=400, detail="book_id required")
    book = db.books.find_one({"_id": ObjectId(book_id)})
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return summarize_book(_serialize(book), model=payload.get("model"))


@app.post("/api/gemini/concierge")
def gemini_concierge(payload: dict):
    message = payload.get("message", "")
    history = payload.get("history", [])
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    return concierge_reply(message, history, model=payload.get("model"))


@app.post("/api/tts")
def tts(payload: dict):
    text = payload.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    audio = text_to_speech(text)
    return StreamingResponse(iter([audio]), media_type="audio/mpeg")


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

    if len(filtered) < 5:
        google_query = _build_google_query(q or "", pref_tags, [])
        imported = _import_google_books(db, google_query, language, 5 - len(filtered))
        existing_ids = {str(b["_id"]) for b in filtered}
        for book in imported:
            if str(book["_id"]) not in existing_ids:
                filtered.append(book)
                existing_ids.add(str(book["_id"]))

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
def create_request(req: CreateRequest, request: Request):
    user = _get_current_user(request.headers.get("authorization"))
    db = get_db()
    doc = {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "raw_text": req.raw_text,
        "parsed_preferences": req.parsed_preferences,
        "matched": [m.dict() for m in req.matched],
        "location_id": req.location_id or "main",
        "status": "new",
        "requester_name": req.requester_name,
        "requester_contact": req.requester_contact,
        "requester_notes": req.requester_notes,
        "user_id": str(user["_id"]) if user else None,
    }
    result = db.requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    if req.requester_contact and "@" in req.requester_contact:
        db.receipts.insert_one(
            {
                "request_id": str(doc["_id"]),
                "to": req.requester_contact,
                "status": "queued",
                "created_at": datetime.utcnow(),
            }
        )
    return _serialize(doc)


@app.get("/api/admin/requests", dependencies=[Depends(_require_staff)])
def list_requests(status: Optional[str] = None):
    try:
        db = get_db()
        query = {}
        if status:
            query["status"] = status
        items = list(db.requests.find(query).sort("created_at", -1))
        return [_serialize(i) for i in items]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"list_requests failed: {exc}")


@app.post("/api/admin/requests/{request_id}/status", dependencies=[Depends(_require_staff)])
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


@app.get("/api/admin/requests/{request_id}/picklist", dependencies=[Depends(_require_staff)])
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
