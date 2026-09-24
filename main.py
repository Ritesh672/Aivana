# lets `uvicorn main:app --reload` work from the project root as well as from
# backend/. the real app is backend/main.py; this file just loads it.
import importlib.util
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND))  # backend modules import each other by name (config, db, ...)

# loaded under another name, since this file is itself called "main"
_spec = importlib.util.spec_from_file_location("aivana_backend", BACKEND / "main.py")
_backend = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_backend)

app = _backend.app
