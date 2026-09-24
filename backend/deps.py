# helpers shared by the route modules: database sessions, the logged-in user,
# api key lookup and response formatting
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select

import llm_service as llm
from config import ALLOW_SERVER_KEYS, COOKIE_SECURE, FREE_MODELS_ENABLED, SESSION_DAYS
from db import ApiKey, Chat, Message, SessionLocal, User
from security import create_token, decrypt_key, read_token

COOKIE_NAME = "session"

FREE_MODEL_IDS = [m for m in llm.ALLOWED_MODELS if llm.provider_of(m) in llm.FREE_PROVIDERS]


# ---------- request dependencies ----------

def get_db():
    with SessionLocal() as db:
        yield db


def current_user(request: Request, db=Depends(get_db)):
    user_id = read_token(request.cookies.get(COOKIE_NAME, ""))
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Not logged in")
    return user


def set_session_cookie(response, user_id):
    response.set_cookie(
        COOKIE_NAME, create_token(user_id),
        max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=COOKIE_SECURE,
    )


def get_owned_chat(db, user, chat_id):
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(404, "Chat not found")
    return chat


def llm_http_error(e: llm.LLMError, status=400):
    return HTTPException(status, {"code": e.code, "message": e.message})


# ---------- api keys and the free tier ----------

def is_free_provider(provider):
    return FREE_MODELS_ENABLED and provider in llm.FREE_PROVIDERS and bool(llm.server_key(provider))


def resolve_api_key(db, user, provider):
    """Return (key, source): the user's own key first, then the server's key
    for free models (or for everything when ALLOW_SERVER_KEYS is on)."""
    row = db.scalar(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == provider))
    if row:
        return decrypt_key(row.encrypted_key), "user"
    if is_free_provider(provider):
        return llm.server_key(provider), "free"
    if ALLOW_SERVER_KEYS and llm.server_key(provider):
        return llm.server_key(provider), "server"
    return None, None


def free_replies_today(db, user):
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(
        select(func.count(Message.id))
        .join(Chat, Message.chat_id == Chat.id)
        .where(Chat.user_id == user.id, Message.role == "ai",
               Message.model.in_(FREE_MODEL_IDS), Message.created_at >= start)
    )


# ---------- formatting ----------

def iso(dt):
    # sqlite drops the timezone, so mark stored times as utc explicitly;
    # otherwise browsers read them as local time
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()
