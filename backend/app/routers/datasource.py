import sys

from fastapi import APIRouter, HTTPException

from app.models.datasource import PostgresConfig, PostgresGraphRequest
from app.models.graph import GraphData
from app.services.graph_store import graph_store

router = APIRouter(prefix="/api/datasources", tags=["datasource"])


def _datasource_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ModuleNotFoundError):
        package = exc.name or "required package"
        detail = (
            f"Missing Python dependency '{package}' in the FastAPI runtime. "
            f"Current interpreter: {sys.executable}. "
            "Start backend with backend/.venv/bin/python -m uvicorn app.main:app --reload --port 8000 "
            "or install backend/requirements.txt into this interpreter."
        )
        return HTTPException(status_code=500, detail=detail)
    return HTTPException(status_code=400, detail=str(exc))


@router.post("/postgres/test")
def test_postgres(config: PostgresConfig) -> dict[str, bool]:
    try:
        from app.services.postgres_client import test_connection

        return {"ok": test_connection(config)}
    except Exception as exc:
        raise _datasource_error(exc) from exc


@router.post("/postgres/graph", response_model=GraphData)
def postgres_graph(request: PostgresGraphRequest) -> GraphData:
    try:
        from app.services.postgres_client import load_graph

        graph = load_graph(request)
        return graph_store.set(graph)
    except Exception as exc:
        raise _datasource_error(exc) from exc
