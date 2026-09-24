# documents: the processing pipeline, its background queue, attaching
# documents to chats, and searching their passages
import hashlib
import logging
import re
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import delete, func, select, update

import llm_service as llm
import rag_service as rag
from config import DOC_MAX_PAGES, DOC_TOP_K
from db import ChatDocument, Document, DocumentChunk, SessionLocal, now
from storage import storage

log = logging.getLogger("aivana.documents")

# one document at a time, so a big pdf never starves a small server
_queue = ThreadPoolExecutor(max_workers=1, thread_name_prefix="documents")


def file_hash(data):
    return hashlib.sha256(data).hexdigest()


def storage_key(user_id, document_id):
    return f"{user_id}/{document_id}.pdf"


# ---------- processing ----------

def enqueue(document_id):
    _queue.submit(_process_safely, document_id)


def resume_unfinished():
    """Re-queue documents that were mid-processing when the server stopped."""
    with SessionLocal() as db:
        pending = db.scalars(select(Document.id).where(Document.status == "processing")).all()
    for document_id in pending:
        enqueue(document_id)


def _update(document_id, **fields):
    with SessionLocal() as db:
        db.execute(update(Document).where(Document.id == document_id).values(**fields, updated_at=now()))
        db.commit()


def _process_safely(document_id):
    try:
        _process(document_id)
    except rag.DocumentError as e:
        _update(document_id, status="failed", error=str(e))
    except llm.LLMError as e:
        _update(document_id, status="failed", error=e.message)
    except Exception:
        log.exception("processing document %s failed", document_id)
        _update(document_id, status="failed", error="Something went wrong while processing this document.")


def _process(document_id):
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        if document is None:
            return  # deleted before its turn in the queue
        key = document.storage_key

    pages = rag.read_pdf_pages(storage.load(key), DOC_MAX_PAGES)
    passages = rag.split_pages(pages)
    if not passages:
        raise rag.DocumentError("No readable text was found in this PDF.")
    _update(document_id, pages=len(pages), progress=5)

    with SessionLocal() as db:  # a re-run starts clean
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        db.commit()

    total = len(passages)
    for start in range(0, total, rag.EMBED_BATCH):
        batch = passages[start:start + rag.EMBED_BATCH]
        vectors = rag.embed_passages([text for _, text in batch])
        with SessionLocal() as db:
            if db.get(Document, document_id) is None:
                return  # the user deleted it mid-way
            db.add_all([
                DocumentChunk(document_id=document_id, chunk_index=start + i, page=page,
                              content=text, embedding=vector)
                for i, ((page, text), vector) in enumerate(zip(batch, vectors, strict=True))
            ])
            done = start + len(batch)
            db.execute(update(Document).where(Document.id == document_id)
                       .values(progress=5 + int(95 * done / total), updated_at=now()))
            db.commit()

    _update(document_id, status="ready", progress=100, chunk_count=total, error=None)


# ---------- chats and documents ----------

def attach(db, user_id, chat_id, document_ids):
    """Link the user's own documents to a chat (ids that aren't theirs are ignored)."""
    if not document_ids:
        return
    owned = set(db.scalars(select(Document.id).where(
        Document.user_id == user_id, Document.id.in_(document_ids))))
    linked = set(db.scalars(select(ChatDocument.document_id).where(ChatDocument.chat_id == chat_id)))
    for document_id in owned - linked:
        db.add(ChatDocument(chat_id=chat_id, document_id=document_id))


def chat_documents(db, chat_id):
    return db.scalars(
        select(Document).join(ChatDocument, ChatDocument.document_id == Document.id)
        .where(ChatDocument.chat_id == chat_id).order_by(ChatDocument.created_at)
    ).all()


# ---------- search ----------

# common english words that add noise to keyword matching
_STOPWORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "could", "did", "do", "does", "for",
    "from", "had", "has", "have", "how", "i", "if", "in", "is", "it", "its", "me", "my", "of",
    "on", "or", "our", "should", "so", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who",
    "why", "will", "with", "would", "you", "your", "about", "tell", "explain", "please",
})


def _keyword_query(question):
    # any of the question's meaningful words may match (OR); ranking favors
    # passages that contain more of them
    # \w alone splits hindi words at their vowel signs, so include devanagari
    words = [w.lower() for w in re.findall(r"[\wऀ-ॿ]+", question) if len(w) > 1]
    words = [w for w in dict.fromkeys(words) if w not in _STOPWORDS][:24]
    return " | ".join(words)


def search(document_ids, question, k=DOC_TOP_K):
    """The k passages most relevant to the question, from the given documents.

    Combines meaning (vector similarity) with exact words (keyword search), so
    both paraphrased questions and exact terms like names or codes are found.
    """
    if not document_ids:
        return []
    question_vector = rag.embed_question(question)
    keywords = _keyword_query(question)

    with SessionLocal() as db:
        in_documents = DocumentChunk.document_id.in_(document_ids)
        by_meaning = db.scalars(
            select(DocumentChunk.id).where(in_documents)
            .order_by(DocumentChunk.embedding.cosine_distance(question_vector)).limit(k * 3)
        ).all()

        by_keyword = []
        if keywords:
            tsv = func.to_tsvector("simple", DocumentChunk.content)
            tsq = func.to_tsquery("simple", keywords)
            by_keyword = db.scalars(
                select(DocumentChunk.id).where(in_documents, tsv.op("@@")(tsq))
                .order_by(func.ts_rank(tsv, tsq).desc()).limit(k * 3)
            ).all()

        # reciprocal rank fusion: a passage ranked high by either search wins
        scores = {}
        for ranking in (by_meaning, by_keyword):
            for rank, chunk_id in enumerate(ranking):
                scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (60 + rank)
        best = sorted(scores, key=scores.get, reverse=True)[:k]

        rows = db.execute(
            select(DocumentChunk, Document.filename)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.id.in_(best))
        ).all()
    found = {chunk.id: (chunk, filename) for chunk, filename in rows}
    return [
        {"document_id": found[i][0].document_id, "filename": found[i][1],
         "page": found[i][0].page, "text": found[i][0].content}
        for i in best if i in found
    ]
