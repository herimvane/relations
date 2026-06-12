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
    max_paths: int = 12
    graph: GraphData | None = None

