import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()


def get_db():
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/bookmatch_kids")
    client = MongoClient(uri)
    try:
        db = client.get_default_database()
    except Exception:
        db = None
    if db is None:
        db_name = uri.rsplit("/", 1)[-1] or "bookmatch_kids"
        db = client[db_name]
    return db
