# aivana api. run from the project root (or this folder): uvicorn main:app --reload
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import documents
from db import documents_enabled, init_db
from routes import auth, chats, models, settings, stream
from routes import documents as documents_routes

app = FastAPI(title="Aivana API")
init_db()

for route_module in (auth, models, chats, stream, settings, documents_routes):
    app.include_router(route_module.router)

# pick up documents that were still processing when the server last stopped
if documents_enabled():
    documents.resume_unfinished()


# ---------- react frontend (after `npm run build` in frontend/) ----------

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (DIST / path).resolve()
        # serve real files from dist only; everything else gets the react app
        if path and file.is_file() and file.is_relative_to(DIST):
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
