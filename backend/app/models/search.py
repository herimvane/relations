from pydantic import BaseModel, Field

from app.models.graph import GraphEdge, GraphNode


class NodeSearchResult(GraphNode):
    degree: int = 0
    source: str = "database"


class NodeSearchResponse(BaseModel):
    results: list[NodeSearchResult] = Field(default_factory=list)


class GraphPath(BaseModel):
    id: str
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    score: float = 0


class PathSearchResponse(BaseModel):
    paths: list[GraphPath] = Field(default_factory=list)
