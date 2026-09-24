# the sidebar's chat list, loading a chat's messages, deleting a chat
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select

from db import Chat, Message
from deps import current_user, get_db, get_owned_chat, iso

router = APIRouter(prefix="/api/chats", tags=["chats"])


def chat_out(chat, last_model=None):
    return {"id": chat.id, "title": chat.title, "summary": chat.summary,
            "updated_at": iso(chat.updated_at), "last_model": last_model}


def message_out(m):
    return {"id": m.id, "role": m.role, "content": m.content, "model": m.model,
            "created_at": iso(m.created_at)}


def like_pattern(text):
    # match the text literally: % and _ are wildcards in LIKE
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("")
def list_chats(q: str = "", user=Depends(current_user), db=Depends(get_db)):
    # model of the newest ai reply in each chat
    last_model = (
        select(Message.model)
        .where(Message.chat_id == Chat.id, Message.role == "ai")
        .order_by(Message.id.desc())
        .limit(1)
        .correlate(Chat)
        .scalar_subquery()
    )
    query = select(Chat, last_model).where(Chat.user_id == user.id)

    # search titles, summaries and message text
    q = q.strip()
    if q:
        pattern = like_pattern(q)
        in_messages = select(Message.id).where(
            Message.chat_id == Chat.id, Message.content.ilike(pattern, escape="\\")
        ).exists()
        query = query.where(or_(
            Chat.title.ilike(pattern, escape="\\"),
            Chat.summary.ilike(pattern, escape="\\"),
            in_messages,
        ))

    rows = db.execute(query.order_by(Chat.updated_at.desc()).limit(200))
    return [chat_out(chat, model) for chat, model in rows]


@router.get("/{chat_id}/messages")
def get_messages(chat_id: str, user=Depends(current_user), db=Depends(get_db)):
    return [message_out(m) for m in get_owned_chat(db, user, chat_id).messages]


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, user=Depends(current_user), db=Depends(get_db)):
    db.delete(get_owned_chat(db, user, chat_id))
    db.commit()
    return {"deleted": chat_id}
