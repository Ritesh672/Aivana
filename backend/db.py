# database tables and session setup
import uuid
from datetime import UTC, datetime

from pgvector.sqlalchemy import HALFVEC
from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from config import DATABASE_URL, EMBEDDING_DIM

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # postgres: test pooled connections before use so a dropped connection
    # (server restart, idle timeout) is replaced instead of failing a request
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def now():
    return datetime.now(UTC)


def new_id():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    # store every datetime with its timezone (timestamptz in postgres)
    type_annotation_map = {datetime: DateTime(timezone=True)}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # reply language: "auto" (model decides), "match" (same as the user's
    # message) or "fixed" (always reply_language)
    reply_language_mode: Mapped[str] = mapped_column(String(10), default="auto")
    reply_language: Mapped[str] = mapped_column(String(50), default="English")
    created_at: Mapped[datetime] = mapped_column(default=now)

    chats: Mapped[list["Chat"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_keys: Mapped[list["ApiKey"]] = relationship(cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(50))
    encrypted_key: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    # 3-4 sentence summary written by a small model after the first reply
    summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now)

    user: Mapped[User] = relationship(back_populates="chats")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    # bigint in postgres (plain integer in sqlite, which it needs for autoincrement)
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))        # "human" or "ai"
    content: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(100))  # which model wrote an ai message
    # json list of the document passages an ai message was based on
    sources: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=now)

    chat: Mapped[Chat] = relationship(back_populates="messages")


# ---------- documents (need postgres with the pgvector extension) ----------

class Document(Base):
    __tablename__ = "documents"
    # the same file uploaded twice by one user is stored once
    __table_args__ = (UniqueConstraint("user_id", "sha256"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(300))
    pages: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(12), default="processing")  # processing | ready | failed
    progress: Mapped[int] = mapped_column(Integer, default=0)  # percent, while processing
    error: Mapped[str | None] = mapped_column(Text)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    page: Mapped[int] = mapped_column(Integer)  # 1-based page the passage comes from
    content: Mapped[str] = mapped_column(Text)
    # half-precision vector: half the storage of float32, same search quality
    embedding = mapped_column(HALFVEC(EMBEDDING_DIM))


class ChatDocument(Base):
    """Which documents are attached to which chat."""
    __tablename__ = "chat_documents"

    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(default=now)


DOCUMENT_TABLES = {"documents", "document_chunks", "chat_documents"}
_documents_enabled = False


def documents_enabled():
    """True when the database can store vectors, so documents can be used."""
    return _documents_enabled


def init_db():
    global _documents_enabled
    _documents_enabled = _enable_pgvector()
    tables = [t for t in Base.metadata.sorted_tables
              if _documents_enabled or t.name not in DOCUMENT_TABLES]
    Base.metadata.create_all(engine, tables=tables)
    _add_missing_columns()
    if _documents_enabled:
        _create_search_indexes()


def _enable_pgvector():
    if engine.dialect.name != "postgresql":
        return False
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return True
    except Exception:
        # the extension isn't installed on this server: run without documents
        return False


def _add_missing_columns():
    # create_all never alters existing tables, so columns added after a
    # database was first created are added here
    wanted = {"chats": {"summary": "TEXT"}, "messages": {"sources": "TEXT"}}
    for table, columns in wanted.items():
        existing = {c["name"] for c in inspect(engine).get_columns(table)}
        for name, sql_type in columns.items():
            if name not in existing:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


def _create_search_indexes():
    # keyword search over passages. the "simple" configuration doesn't stem
    # words, so it treats every language the same (including hindi)
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_document_chunks_fts "
            "ON document_chunks USING gin (to_tsvector('simple', content))"
        ))
