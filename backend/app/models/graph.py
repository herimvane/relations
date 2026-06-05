from typing import Any

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    name: str
    type: str = "未知"
    group: str | None = None
    weight: float = 1
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str | None = None
    source: str
    target: str
    relation_type: str = "关联"
    weight: float = 1
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphData(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
