# database tables and session setup
import uuid
from datetime import UTC, datetime

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

from config import DATABASE_URL

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
    created_at: Mapped[datetime] = mapped_column(default=now)

    chat: Mapped[Chat] = relationship(back_populates="messages")


def init_db():
    Base.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns():
    # create_all never alters existing tables, so columns added after a
    # database was first created are added here
    columns = {c["name"] for c in inspect(engine).get_columns("chats")}
    if "summary" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chats ADD COLUMN summary TEXT"))
