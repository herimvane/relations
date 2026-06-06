from fastapi import APIRouter

from app.models.graph import GraphData
from app.models.query import ExtractTableRequest, GraphFilterRequest, PathQueryRequest
from app.services.graph_filter import filter_graph
from app.services.graph_store import graph_store
from app.services.path_query import find_path
from app.services.table_extractor import extract_from_rows

router = APIRouter(prefix="/api/graph", tags=["query"])


@router.post("/filter", response_model=GraphData)
def graph_filter(request: GraphFilterRequest) -> GraphData:
    return filter_graph(request.graph or graph_store.get(), request.node_types, request.relation_types, request.min_weight)


@router.post("/path", response_model=GraphData)
def graph_path(request: PathQueryRequest) -> GraphData:
    return find_path(request.graph or graph_store.get(), request.source, request.target, request.max_depth, request.max_paths)


@router.post("/extract-table", response_model=GraphData)
def graph_extract_table(request: ExtractTableRequest) -> GraphData:
    graph = extract_from_rows(request.rows, request.source_field, request.target_field, request.relation_field, request.weight_field)
    return graph_store.set(graph)
