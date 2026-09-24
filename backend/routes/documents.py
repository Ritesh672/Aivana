# the document library: upload pdfs, watch them process, attach them to chats
import contextlib
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select

import documents
from config import DOC_MAX_MB, DOC_MAX_PAGES, DOC_MAX_PER_USER
from db import ChatDocument, Document, documents_enabled, new_id
from deps import current_user, get_db, get_owned_chat, iso
from storage import storage

router = APIRouter(prefix="/api", tags=["documents"])


def require_documents():
    if not documents_enabled():
        raise HTTPException(503, {
            "code": "documents_unavailable",
            "message": "Documents need PostgreSQL with the pgvector extension.",
        })


def document_out(document, duplicate=False):
    return {
        "id": document.id,
        "filename": document.filename,
        "size_bytes": document.size_bytes,
        "pages": document.pages,
        "status": document.status,
        "progress": document.progress,
        "error": document.error,
        "created_at": iso(document.created_at),
        "duplicate": duplicate,
    }


def get_owned_document(db, user, document_id):
    document = db.get(Document, document_id)
    if document is None or document.user_id != user.id:
        raise HTTPException(404, "Document not found")
    return document


@router.get("/documents/config")
def documents_config():
    return {
        "enabled": documents_enabled(),
        "max_mb": DOC_MAX_MB,
        "max_pages": DOC_MAX_PAGES,
        "max_documents": DOC_MAX_PER_USER,
    }


@router.get("/documents")
def list_documents(user=Depends(current_user), db=Depends(get_db)):
    require_documents()
    rows = db.scalars(select(Document).where(Document.user_id == user.id)
                      .order_by(Document.created_at.desc()))
    return [document_out(d) for d in rows]


@router.post("/documents")
def upload_document(file: UploadFile = File(...), user=Depends(current_user), db=Depends(get_db)):
    require_documents()
    filename = PurePath(file.filename or "document.pdf").name[:255]
    data = file.file.read(DOC_MAX_MB * 1024 * 1024 + 1)
    if len(data) > DOC_MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"The file is larger than {DOC_MAX_MB} MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Only PDF files are supported for now.")

    digest = documents.file_hash(data)
    existing = db.scalar(select(Document).where(Document.user_id == user.id, Document.sha256 == digest))
    if existing:
        return document_out(existing, duplicate=True)

    count = db.scalar(select(func.count(Document.id)).where(Document.user_id == user.id))
    if count >= DOC_MAX_PER_USER:
        raise HTTPException(
            400, f"You can keep up to {DOC_MAX_PER_USER} documents. Delete one to add another."
        )

    document_id = new_id()
    key = documents.storage_key(user.id, document_id)
    try:
        storage.save(key, data, "application/pdf")
    except Exception:
        raise HTTPException(502, "The file couldn't be stored. Try again.") from None

    document = Document(id=document_id, user_id=user.id, filename=filename, size_bytes=len(data),
                        sha256=digest, storage_key=key)
    db.add(document)
    db.commit()
    documents.enqueue(document.id)
    return document_out(document)


@router.get("/documents/{document_id}")
def get_document(document_id: str, user=Depends(current_user), db=Depends(get_db)):
    require_documents()
    return document_out(get_owned_document(db, user, document_id))


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, user=Depends(current_user), db=Depends(get_db)):
    require_documents()
    document = get_owned_document(db, user, document_id)
    key = document.storage_key
    db.delete(document)  # passages and chat links go with it (on delete cascade)
    db.commit()
    # the record is gone either way; a leftover file is harmless
    with contextlib.suppress(Exception):
        storage.delete(key)
    return {"deleted": document_id}


@router.get("/chats/{chat_id}/documents")
def list_chat_documents(chat_id: str, user=Depends(current_user), db=Depends(get_db)):
    if not documents_enabled():
        return []
    get_owned_chat(db, user, chat_id)
    return [document_out(d) for d in documents.chat_documents(db, chat_id)]


@router.delete("/chats/{chat_id}/documents/{document_id}")
def detach_document(chat_id: str, document_id: str, user=Depends(current_user), db=Depends(get_db)):
    require_documents()
    get_owned_chat(db, user, chat_id)
    link = db.get(ChatDocument, (chat_id, document_id))
    if link:
        db.delete(link)
        db.commit()
    return {"detached": document_id}
