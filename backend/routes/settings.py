# per-user preferences and api keys (keys are write-only: never sent back)
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

import llm_service as llm
from config import ALLOW_SERVER_KEYS
from db import ApiKey
from deps import current_user, get_db, is_free_provider, iso
from security import encrypt_key

router = APIRouter(prefix="/api", tags=["settings"])


# ---------- reply language ----------

class SettingsIn(BaseModel):
    reply_language_mode: str
    reply_language: str = Field(default="English", min_length=1, max_length=50)


@router.get("/settings")
def get_settings(user=Depends(current_user)):
    return {"reply_language_mode": user.reply_language_mode, "reply_language": user.reply_language}


@router.put("/settings")
def update_settings(body: SettingsIn, user=Depends(current_user), db=Depends(get_db)):
    if body.reply_language_mode not in llm.LANGUAGE_MODES:
        raise HTTPException(400, "reply_language_mode must be auto, match or fixed")
    user.reply_language_mode = body.reply_language_mode
    user.reply_language = body.reply_language.strip()
    db.commit()
    return get_settings(user)


# ---------- api keys ----------

class KeyIn(BaseModel):
    api_key: str = Field(min_length=8, max_length=500)


def check_provider(provider):
    if provider not in llm.PROVIDERS:
        raise HTTPException(404, f"Unknown provider '{provider}'")


def find_key(db, user, provider):
    return db.scalar(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == provider))


@router.get("/keys")
def list_keys(user=Depends(current_user), db=Depends(get_db)):
    saved = {k.provider: k for k in db.scalars(select(ApiKey).where(ApiKey.user_id == user.id))}
    return [
        {
            "provider": provider,
            "label": p["label"],
            "saved": provider in saved,
            "updated_at": iso(saved[provider].updated_at) if provider in saved else None,
            "server_fallback": is_free_provider(provider)
            or (ALLOW_SERVER_KEYS and bool(llm.server_key(provider))),
            "free": is_free_provider(provider),
        }
        for provider, p in llm.PROVIDERS.items()
    ]


@router.put("/keys/{provider}")
def save_key(provider: str, body: KeyIn, user=Depends(current_user), db=Depends(get_db)):
    check_provider(provider)
    row = find_key(db, user, provider)
    if row is None:
        row = ApiKey(user_id=user.id, provider=provider)
        db.add(row)
    row.encrypted_key = encrypt_key(body.api_key.strip())
    db.commit()
    return {"provider": provider, "saved": True}


@router.delete("/keys/{provider}")
def delete_key(provider: str, user=Depends(current_user), db=Depends(get_db)):
    check_provider(provider)
    row = find_key(db, user, provider)
    if row:
        db.delete(row)
        db.commit()
    return {"provider": provider, "saved": False}
