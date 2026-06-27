from pydantic import BaseModel, Field

from app.models.graph import GraphData, GraphEdge, GraphNode


class ViewStats(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    visible_nodes: int = 0
    visible_edges: int = 0
    hidden_nodes: int = 0


class CommunitySummary(BaseModel):
    id: str
    name: str
    node_count: int
    edge_count: int = 0
    importance: float = 0


class GraphViewResponse(GraphData):
    view_level: str = "L0"
    title: str = ""
    can_drill: bool = True
    complete: bool = False
    communities: list[CommunitySummary] = Field(default_factory=list)
    stats: ViewStats = Field(default_factory=ViewStats)
