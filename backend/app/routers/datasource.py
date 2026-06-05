from fastapi import APIRouter, HTTPException

from app.models.datasource import PostgresConfig, PostgresGraphRequest
from app.models.graph import GraphData
from app.services.graph_store import graph_store
from app.services.postgres_client import load_graph, test_connection

router = APIRouter(prefix="/api/datasources", tags=["datasource"])


@router.post("/postgres/test")
def test_postgres(config: PostgresConfig) -> dict[str, bool]:
    try:
        return {"ok": test_connection(config)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/postgres/graph", response_model=GraphData)
def postgres_graph(request: PostgresGraphRequest) -> GraphData:
    try:
        graph = load_graph(request)
        return graph_store.set(graph)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
