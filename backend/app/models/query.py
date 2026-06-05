from typing import Any

from pydantic import BaseModel, Field

from app.models.graph import GraphData


class GraphFilterRequest(BaseModel):
    graph: GraphData | None = None
    node_types: list[str] = Field(default_factory=list)
    relation_types: list[str] = Field(default_factory=list)
    min_weight: float = 0


class PathQueryRequest(BaseModel):
    source: str
    target: str
    max_depth: int = 4
    graph: GraphData | None = None


class ExtractTableRequest(BaseModel):
    rows: list[dict[str, Any]]
    source_field: str
    target_field: str
    relation_field: str | None = None
    weight_field: str | None = None
