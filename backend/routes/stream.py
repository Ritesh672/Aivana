# sending a message: the reply streams back as server-sent events
#   meta    -> {chat_id, title, model}    first, so a new chat can appear at once
#   sources -> {sources: [...]}           document passages the answer is based on
#   token   -> {text}                     each piece of the reply
#   done    -> {message_id}               reply saved; the ui is usable again
#   title   -> {chat_id, title, summary}  optional, generated after done
#   error   -> {code, message, chat_exists, partial}
import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import documents
import llm_service as llm
from config import DOC_MAX_PER_USER, FREE_DAILY_LIMIT
from db import Chat, Message, SessionLocal, User, documents_enabled, now
from deps import (
    current_user,
    free_replies_today,
    get_owned_chat,
    is_free_provider,
    llm_http_error,
    resolve_api_key,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("aivana.chat")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    model: str
    chat_id: str | None = None   # leave empty to start a new chat
    # documents to attach to the chat (added to any already attached)
    document_ids: list[str] = Field(default_factory=list, max_length=DOC_MAX_PER_USER)


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def prepare_turn(user_id, req):
    """Validate the request, save the user's message and load the history."""
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if req.model not in llm.ALLOWED_MODELS:
            raise llm_http_error(llm.LLMError("unknown_model", f"Unknown model '{req.model}'"))

        chat = get_owned_chat(db, user, req.chat_id) if req.chat_id else None

        api_key, source = resolve_api_key(db, user, llm.provider_of(req.model))
        if not api_key:
            provider = llm.PROVIDERS[llm.provider_of(req.model)]["label"]
            raise llm_http_error(llm.LLMError(
                "missing_key", f"No API key saved for {provider}. Add one in Settings.",
            ))
        # free models run on the server's token, so cap them per user per day
        if source == "free" and free_replies_today(db, user) >= FREE_DAILY_LIMIT:
            raise llm_http_error(llm.LLMError(
                "free_limit",
                f"You've used today's {FREE_DAILY_LIMIT} free replies. "
                "Add your own API key in Settings to keep chatting.",
            ), status=429)

        if chat is None:
            chat = Chat(user_id=user.id, title=req.message.strip()[:60])
            db.add(chat)

        human = Message(chat=chat, role="human", content=req.message)
        db.add(human)
        chat.updated_at = now()
        db.flush()
        attached = []
        if documents_enabled():
            documents.attach(db, user.id, chat.id, req.document_ids)
            db.flush()
            attached = documents.chat_documents(db, chat.id)
        db.commit()

        history = [{"role": m.role, "content": m.content} for m in chat.messages]
        passages = find_passages(attached, req.message)
        system_prompt = llm.build_system_prompt(
            user.reply_language_mode, user.reply_language,
            passages=passages, attached=[d.filename for d in attached],
        )
        # summarize once, early in the chat (a stopped or failed first turn
        # gets another chance on the next one)
        needs_summary = chat.summary is None and len(history) <= 5
        return chat.id, chat.title, human.id, history, api_key, system_prompt, needs_summary, passages


def find_passages(attached, question):
    """Passages from the chat's ready documents that are relevant to the question.
    A search failure shouldn't block the chat, so it just means no passages."""
    ready = [d.id for d in attached if d.status == "ready"]
    if not ready:
        return []
    try:
        return documents.search(ready, question)
    except llm.LLMError:
        log.warning("document search failed; answering without passages", exc_info=True)
        return []


def sources_out(passages):
    return [{"n": n, "document_id": p["document_id"], "filename": p["filename"],
             "page": p["page"], "text": p["text"]} for n, p in enumerate(passages, start=1)]


def finish_turn(chat_id, human_id, reply, model_id, sources=None):
    """Save the reply. If nothing came back, undo the user's message so the
    history stays in human/ai pairs. Returns (ai_message_id, chat_still_exists)."""
    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            # the user deleted the chat while the reply was streaming
            return None, False
        if reply:
            ai = Message(chat_id=chat_id, role="ai", content=reply, model=model_id,
                         sources=json.dumps(sources) if sources else None)
            db.add(ai)
            chat.updated_at = now()
            db.commit()
            return ai.id, True
        human = db.get(Message, human_id)
        if human is not None:
            db.delete(human)
            db.flush()
        if not chat.messages:
            db.delete(chat)
        db.commit()
        return None, db.get(Chat, chat_id) is not None


def first_exchange(chat_id):
    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            return None
        question = next((m.content for m in chat.messages if m.role == "human"), None)
        answer = next((m.content for m in chat.messages if m.role == "ai"), None)
        return (question, answer) if question and answer else None


def save_summary(chat_id, title, summary):
    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is not None:
            chat.title, chat.summary = title, summary
            db.commit()


async def summarize(chat_id):
    """Ask the small free model for a title and summary; None if it fails
    (the chat then keeps its first-message title)."""
    exchange = await run_in_threadpool(first_exchange, chat_id)
    if not exchange:
        return None
    try:
        title, summary = await asyncio.wait_for(llm.summarize_chat(*exchange), timeout=25)
    except (llm.LLMError, TimeoutError):
        return None
    await run_in_threadpool(save_summary, chat_id, title, summary)
    return {"chat_id": chat_id, "title": title, "summary": summary}


@router.post("/stream")
async def chat_stream(req: ChatRequest, user=Depends(current_user)):
    chat_id, title, human_id, history, api_key, system_prompt, needs_summary, passages = (
        await run_in_threadpool(prepare_turn, user.id, req)
    )
    sources = sources_out(passages)

    async def events():
        parts, error, result = [], None, (None, True)
        yield sse("meta", {"chat_id": chat_id, "title": title, "model": req.model})
        if sources:
            yield sse("sources", {"sources": sources})
        try:
            async for text in llm.stream_reply(req.model, history, api_key, system_prompt):
                parts.append(text)
                yield sse("token", {"text": text})
        except llm.LLMError as e:
            error = e
        finally:
            # runs on success, on error and when the user presses stop
            # (the client disconnects), so partial replies are kept
            result = finish_turn(chat_id, human_id, "".join(parts), req.model, sources)

        ai_id, chat_exists = result
        if error:
            yield sse("error", {"code": error.code, "message": error.message,
                                "chat_exists": chat_exists, "partial": bool(parts)})
            return
        yield sse("done", {"message_id": ai_id})
        # the reply is complete and the ui is already usable while the
        # small model writes the chat's title and summary
        if chat_exists and needs_summary and is_free_provider("huggingface"):
            meta = await summarize(chat_id)
            if meta:
                yield sse("title", meta)

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
