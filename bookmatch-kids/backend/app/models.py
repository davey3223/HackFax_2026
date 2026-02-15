from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ParseRequest(BaseModel):
    text: str
    age: Optional[int] = None
    language: Optional[str] = None
    format: Optional[str] = None
    model: Optional[str] = None


class ParsedPreferences(BaseModel):
    age: Optional[int] = None
    language: Optional[str] = None
    format: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)


class BookMatch(BaseModel):
    book_id: str
    score: float


class CreateRequest(BaseModel):
    raw_text: str
    parsed_preferences: Dict[str, Any]
    matched: List[BookMatch] = Field(default_factory=list)
    location_id: Optional[str] = None
    requester_name: Optional[str] = None
    requester_contact: Optional[str] = None
    requester_notes: Optional[str] = None


class UpdateStatus(BaseModel):
    status: str
