import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId

from .db import get_db


def _pbkdf2(password: str, salt: bytes) -> str:
    import hashlib

    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return dk.hex()


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    return salt.hex(), _pbkdf2(password, salt)


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    return _pbkdf2(password, salt) == hash_hex


def create_session(user_id: ObjectId) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    expires = datetime.utcnow() + timedelta(days=7)
    db.sessions.insert_one(
        {
            "user_id": user_id,
            "token": token,
            "expires_at": expires,
            "created_at": datetime.utcnow(),
        }
    )
    return token


def get_user_by_token(token: str) -> Optional[dict]:
    db = get_db()
    session = db.sessions.find_one({"token": token})
    if not session:
        return None
    if session.get("expires_at") and session["expires_at"] < datetime.utcnow():
        db.sessions.delete_one({"_id": session["_id"]})
        return None
    user = db.users.find_one({"_id": session["user_id"]})
    return user


def create_user(email: str, name: str, password: str, role: str) -> dict:
    db = get_db()
    existing = db.users.find_one({"email": email})
    if existing:
        raise ValueError("User already exists")
    salt, hashed = hash_password(password)
    doc = {
        "email": email,
        "name": name,
        "role": role,
        "password_salt": salt,
        "password_hash": hashed,
        "created_at": datetime.utcnow(),
        "recommendations": [],
    }
    result = db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def authenticate(email: str, password: str) -> Optional[dict]:
    db = get_db()
    user = db.users.find_one({"email": email})
    if not user:
        return None
    if not verify_password(password, user.get("password_salt", ""), user.get("password_hash", "")):
        return None
    return user


def staff_signup_allowed(invite_code: str | None) -> bool:
    required = os.getenv("STAFF_SIGNUP_CODE")
    if not required:
        return False
    return bool(invite_code) and invite_code == required


def ensure_demo_users() -> None:
    if os.getenv("DEMO_LOGIN", "false").lower() not in {"1", "true", "yes"}:
        return
    email = os.getenv("DEMO_STAFF_EMAIL", "demo@bookmatch.local").lower()
    password = os.getenv("DEMO_STAFF_PASSWORD", "demo1234")
    name = os.getenv("DEMO_STAFF_NAME", "Demo Staff")
    db = get_db()
    if not db.users.find_one({"email": email}):
        salt, hashed = hash_password(password)
        db.users.insert_one(
            {
                "email": email,
                "name": name,
                "role": "staff",
                "password_salt": salt,
                "password_hash": hashed,
                "created_at": datetime.utcnow(),
                "recommendations": [],
            }
        )


def create_magic_token(role: str = "volunteer") -> str:
    token = secrets.token_urlsafe(24)
    db = get_db()
    expires = datetime.utcnow() + timedelta(hours=2)
    db.magic_tokens.insert_one(
        {"token": token, "role": role, "expires_at": expires, "created_at": datetime.utcnow()}
    )
    return token


def consume_magic_token(token: str) -> Optional[dict]:
    db = get_db()
    doc = db.magic_tokens.find_one({"token": token})
    if not doc:
        return None
    if doc.get("expires_at") and doc["expires_at"] < datetime.utcnow():
        db.magic_tokens.delete_one({"_id": doc["_id"]})
        return None
    db.magic_tokens.delete_one({"_id": doc["_id"]})
    role = doc.get("role", "volunteer")
    email = f"{role}-{token[:6]}@bookmatch.local"
    user = db.users.find_one({"email": email})
    if not user:
        salt, hashed = hash_password(secrets.token_urlsafe(12))
        result = db.users.insert_one(
            {
                "email": email,
                "name": "Volunteer",
                "role": role,
                "password_salt": salt,
                "password_hash": hashed,
                "created_at": datetime.utcnow(),
                "recommendations": [],
            }
        )
        user = db.users.find_one({"_id": result.inserted_id})
    return user
