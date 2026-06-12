from fastapi import APIRouter, HTTPException, Query

from app.core.datasource_config import active_dataset
from app.models.view import GraphViewResponse
from app.services import graph_view_service

router = APIRouter(prefix="/api/views", tags=["views"])


def _handle_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


@router.get("/universe", response_model=GraphViewResponse)
def universe(limit: int = Query(default=220, ge=20, le=500), edge_limit: int = Query(default=180, ge=0, le=1200)) -> GraphViewResponse:
    try:
        return graph_view_service.universe(active_dataset(), limit=limit, edge_limit=edge_limit)
    except Exception as error:
        raise _handle_error(error) from error


@router.get("/galaxy/{community_id}", response_model=GraphViewResponse)
def galaxy(community_id: str) -> GraphViewResponse:
    try:
        return graph_view_service.galaxy(active_dataset(), community_id)
    except Exception as error:
        raise _handle_error(error) from error


@router.get("/backbone/{node_id}", response_model=GraphViewResponse)
def backbone(node_id: str) -> GraphViewResponse:
    try:
        return graph_view_service.backbone(active_dataset(), node_id)
    except Exception as error:
        raise _handle_error(error) from error


@router.get("/local/{node_id}", response_model=GraphViewResponse)
def local(node_id: str) -> GraphViewResponse:
    try:
        return graph_view_service.local(active_dataset(), node_id)
    except Exception as error:
        raise _handle_error(error) from error
