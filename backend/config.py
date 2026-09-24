# app settings, read from the environment or the .env file in the project root
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR.parent / ".env")


def _required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is missing. Copy .env.example to .env and fill it in.")
    return value


def _flag(name, default="false"):
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes"}


# postgres, e.g. postgresql+psycopg://user:password@localhost:5432/aivana
# (without it, a local sqlite file is used)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'aivana.db'}")

# signs login cookies
JWT_SECRET = _required("JWT_SECRET")
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "7"))

# fernet master key that encrypts users' saved api keys
ENCRYPTION_KEY = _required("ENCRYPTION_KEY")

# when true, users without their own key fall back to the keys in .env.
# keep false once other people can sign up, or they spend your credits
ALLOW_SERVER_KEYS = _flag("ALLOW_SERVER_KEYS")

# set true when served over https
COOKIE_SECURE = _flag("COOKIE_SECURE")

# only the last N messages are sent to the model, to keep long chats cheap
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "30"))

# free models: users without their own key can use the hugging face models
# through the server's HF_TOKEN. that token's usage is billed to you, so each
# user gets a daily cap on free replies
FREE_MODELS_ENABLED = _flag("FREE_MODELS_ENABLED", "true")
FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "50"))

# documents: pdf upload and question answering (needs postgres with pgvector)
DOC_MAX_MB = int(os.getenv("DOC_MAX_MB", "25"))
DOC_MAX_PAGES = int(os.getenv("DOC_MAX_PAGES", "500"))
DOC_MAX_PER_USER = int(os.getenv("DOC_MAX_PER_USER", "20"))
DOC_TOP_K = int(os.getenv("DOC_TOP_K", "6"))  # passages given to the model per question

# where original pdfs are kept. with SUPABASE_URL and SUPABASE_SERVICE_KEY set
# they go to supabase storage; otherwise to backend/uploads (fine locally, but
# free hosts wipe their disk on restart)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "documents")
UPLOAD_DIR = BACKEND_DIR / "uploads"

# embedding model for document search, via hugging face's hosted api. every
# user shares it (vectors from different models can't be compared); changing
# it means re-processing all documents
EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DIM = 1024
