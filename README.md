# Aivana

One chat app for Claude, GPT, Grok, Gemini, DeepSeek and open-source models. Pick a model, switch any time mid-conversation, and keep every chat in one place.

## Features

- **Ask questions about your PDFs**: upload documents (up to 500 pages), attach them to any chat, and get answers that cite the exact pages. Works with every model.
- **Many models, one chat**: switch between Claude, GPT, Grok, DeepSeek and Hugging Face models without losing the conversation.
- **Free to start**: new users chat with open-source models (Llama, Qwen) through Hugging Face's hosted API until they add their own keys. Adding a key switches to that company's model automatically.
- **Bring your own key**: each user saves their own provider keys. Keys are encrypted at rest and never sent back to the browser.
- **Streaming replies** with a Stop button, markdown and code blocks with copy.
- **Chat history** grouped by date, with search, auto-generated titles and 3–4 sentence summaries.
- **Reply language**: auto, match the user's language, or always one language.
- **English, Hindi and Spanish** interface, light and dark themes, works on phones.

## Tech stack

- **Backend:** FastAPI, LangChain, SQLAlchemy, PostgreSQL with pgvector (or SQLite locally, without documents)
- **Frontend:** React, Vite, react-i18next

## Project structure

```
main.py             lets `uvicorn main:app` run from the project root
backend/
  main.py           app setup, serves the built frontend
  routes/           api endpoints: auth, models, chats, stream, settings, documents
  deps.py           shared helpers: db session, current user, key lookup
  llm_service.py    LangChain for chat: model list, streaming, errors, summaries
  rag_service.py    LangChain for documents: pdf reading, splitting, embeddings
  documents.py      document processing queue, attaching to chats, search
  storage.py        where uploaded files live: Supabase Storage or a local folder
  db.py             tables: users, api_keys, chats, messages, documents, document_chunks, chat_documents
  security.py       password hashing, login cookies, api key encryption
  config.py         settings read from .env
  cli.py            chat in the terminal
  schema.sql        postgres schema (the app also creates tables itself)
frontend/
  src/components/   chat view, sidebar, model picker, settings, login
  src/locales/      translations
.env.example        every setting, documented
```

## Getting started

Needs Python 3.12+ and Node 20+. For documents you need PostgreSQL with the pgvector extension; the free tier of [Supabase](https://supabase.com) includes it (use its session pooler connection string). Without PostgreSQL, a local SQLite file is used and everything except documents works.

```bash
# 1. backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r backend/requirements.txt

# 2. frontend
cd frontend
npm install
cd ..

# 3. settings
cp .env.example .env             # then fill in JWT_SECRET, ENCRYPTION_KEY, HF_TOKEN, DATABASE_URL
```

For PostgreSQL, create a database and either run `psql "$DATABASE_URL" -f backend/schema.sql` or let the app create the tables on first start.

## Running

Development (two terminals, with hot reload):

```bash
# terminal 1: api on http://localhost:8000 (from the project root, venv active)
uvicorn main:app --reload

# terminal 2: ui on http://localhost:5173 (forwards /api to the backend)
cd frontend
npm run dev
```

Production-style (one server):

```bash
cd frontend && npm run build && cd ..
uvicorn main:app --host 0.0.0.0 --port 8000
```

API docs are at `/docs` while the server runs.

## Configuration

All settings live in `.env`; see [.env.example](.env.example) for the full list.

| Variable | Default | What it does |
|---|---|---|
| `JWT_SECRET` | required | Signs login cookies. |
| `ENCRYPTION_KEY` | required | Encrypts saved API keys. Don't change it once users have saved keys. |
| `DATABASE_URL` | local SQLite | PostgreSQL connection string (with pgvector for documents). |
| `HF_TOKEN` | none | Powers the free models, chat summaries and document embeddings. Usage is billed to this token. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | none | Store uploaded PDFs in Supabase Storage. Without them they go to `backend/uploads`. |
| `DOC_MAX_MB`, `DOC_MAX_PAGES`, `DOC_MAX_PER_USER` | `25`, `500`, `20` | Upload limits. |
| `FREE_MODELS_ENABLED` | `true` | Let users without keys use the Hugging Face models. |
| `FREE_DAILY_LIMIT` | `50` | Free replies per user per day. |
| `ALLOW_SERVER_KEYS` | `false` | Let every user fall back to the provider keys in `.env`. Keep off if others can sign up. |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `MAX_HISTORY_MESSAGES` | `30` | Messages sent to the model per turn, to keep long chats affordable. |

## How documents work

1. **Upload**: the PDF is stored (Supabase Storage or `backend/uploads`) and a row is added to `documents`. The request returns at once.
2. **Process** (in the background, one document at a time): read each page with `pypdf`, split pages into ~1,200-character passages that never cross a page, embed them with `BAAI/bge-m3` through Hugging Face's hosted API, and save them to `document_chunks` as half-precision pgvector vectors. The UI shows progress.
3. **Ask**: the question is embedded and matched against the chat's attached documents two ways, by meaning (vector similarity) and by exact words (Postgres full-text search), and the two rankings are merged. The top passages go into the prompt, numbered, and the model cites them like `[1]`.
4. **Cite**: the answer shows the cited passages with file name and page; clicking one shows the exact text.

Searches only ever look at the current user's documents attached to the current chat. Scanned PDFs (images with no text) are detected and reported; OCR isn't supported yet.

## Adding or changing models

Models are listed in `ALLOWED_MODELS` in [backend/llm_service.py](backend/llm_service.py); only those can be requested. `FEATURED_MODELS` controls which ones the model menu shows by default (the rest sit behind "Show all models").

Hugging Face models are always called through Hugging Face's hosted API (`HuggingFaceEndpoint`), so nothing is downloaded or run on the server. Don't install `transformers` or `torch`, and don't use `HuggingFacePipeline`.

## Development

```bash
cd backend
ruff check .            # lint (pip install ruff)
```
