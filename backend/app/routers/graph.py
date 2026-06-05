from fastapi import APIRouter

from app.models.graph import GraphData
from app.services.graph_store import graph_store

router = APIRouter(prefix="/api", tags=["graph"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/graph", response_model=GraphData)
def get_graph() -> GraphData:
    return graph_store.get()
