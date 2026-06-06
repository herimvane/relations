import importlib.util
import sys

from fastapi import APIRouter

from app.models.graph import GraphData
from app.services.graph_store import graph_store

router = APIRouter(prefix="/api", tags=["graph"])


@router.get("/health")
def health() -> dict[str, object]:
    dependencies = {
        "sqlalchemy": importlib.util.find_spec("sqlalchemy") is not None,
        "psycopg": importlib.util.find_spec("psycopg") is not None,
        "pandas": importlib.util.find_spec("pandas") is not None,
        "openpyxl": importlib.util.find_spec("openpyxl") is not None,
    }
    return {
        "status": "ok",
        "python": sys.executable,
        "version": sys.version,
        "dependencies": dependencies,
    }


@router.get("/graph", response_model=GraphData)
def get_graph() -> GraphData:
    return graph_store.get()
