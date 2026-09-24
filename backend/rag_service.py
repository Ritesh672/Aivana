# document side of langchain: read pdfs, split them into passages and turn
# text into vectors. like llm_service.py, this is the only place (for
# documents) that talks to langchain or the embedding api
import io
import re
import time

from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from pypdf.errors import PdfReadError

import llm_service as llm
from config import EMBEDDING_MODEL

# ~1200 characters is a few paragraphs: enough context for an answer, small
# enough that several passages fit in one prompt
_splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=150)

EMBED_BATCH = 32


class DocumentError(Exception):
    """A problem with the uploaded file, worded for the user."""


def read_pdf_pages(data, max_pages):
    """Return the text of each page. Raises DocumentError for files we can't use."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")  # many "encrypted" pdfs only block editing
            except Exception:
                raise DocumentError("This PDF is password-protected.") from None
        page_count = len(reader.pages)
    except PdfReadError:
        raise DocumentError("This file couldn't be read as a PDF.") from None

    if page_count == 0:
        raise DocumentError("This PDF has no pages.")
    if page_count > max_pages:
        raise DocumentError(f"This PDF has {page_count} pages; the limit is {max_pages}.")

    pages = []
    for page in reader.pages:
        try:
            pages.append(_clean(page.extract_text() or ""))
        except Exception:
            pages.append("")  # one broken page shouldn't sink the document

    # scanned pdfs are images of pages, with no text layer to extract
    if sum(len(p) for p in pages) < 30 * page_count:
        raise DocumentError(
            "This PDF has no selectable text. It may be a scan; scanned documents aren't supported yet."
        )
    return pages


def _clean(text):
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_pages(pages):
    """Split each page into passages. Returns [(page_number, text)], 1-based pages.
    Passages never cross a page boundary, so every one can be cited by page."""
    passages = []
    for number, page_text in enumerate(pages, start=1):
        for piece in _splitter.split_text(page_text):
            if len(piece.strip()) > 20:
                passages.append((number, piece.strip()))
    return passages


def _embedder():
    return HuggingFaceEndpointEmbeddings(
        model=EMBEDDING_MODEL,
        task="feature-extraction",
        huggingfacehub_api_token=llm.server_key("huggingface"),
    )


def _with_retries(call, attempts=3):
    # the hosted api sometimes answers "model loading" or rate-limits briefly
    for attempt in range(attempts):
        try:
            return call()
        except Exception as e:
            error = llm.classify_error(e, "huggingface")
            if attempt == attempts - 1 or error.code not in ("model_down", "rate_limit", "model_error"):
                raise error from e
            time.sleep(2 + attempt * 3)


def embed_passages(texts):
    """Vectors for a batch of passages (call with at most EMBED_BATCH texts)."""
    if not llm.server_key("huggingface"):
        raise llm.LLMError("missing_key", "HF_TOKEN is not set, so documents can't be processed.")
    return _with_retries(lambda: _embedder().embed_documents(texts))


def embed_question(text):
    if not llm.server_key("huggingface"):
        raise llm.LLMError("missing_key", "HF_TOKEN is not set, so documents can't be searched.")
    return _with_retries(lambda: _embedder().embed_query(text))
