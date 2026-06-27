from fastapi import APIRouter, HTTPException, Query

from app.core.datasource_config import active_dataset
from app.models.search import NodeSearchResponse, PathSearchResponse
from app.services import search_service

router = APIRouter(prefix="/api/search", tags=["search"])


def _handle_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


@router.get("/nodes", response_model=NodeSearchResponse)
def nodes(q: str = Query(min_length=1), limit: int = Query(default=20, ge=1, le=50)) -> NodeSearchResponse:
    try:
        return search_service.search_nodes(active_dataset(), q, limit=limit)
    except Exception as error:
        raise _handle_error(error) from error


@router.get("/path", response_model=PathSearchResponse)
def path(
    source: str = Query(min_length=1),
    target: str = Query(min_length=1),
    max_depth: int = Query(default=4, ge=1, le=5),
    max_paths: int = Query(default=8, ge=1, le=20),
) -> PathSearchResponse:
    try:
        return search_service.search_paths(active_dataset(), source, target, max_depth=max_depth, max_paths=max_paths)
    except Exception as error:
        raise _handle_error(error) from error
