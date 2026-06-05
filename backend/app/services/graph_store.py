from app.models.graph import GraphData


class GraphStore:
    def __init__(self) -> None:
        self._graph = GraphData()

    def get(self) -> GraphData:
        return self._graph

    def set(self, graph: GraphData) -> GraphData:
        self._graph = graph
        return self._graph


graph_store = GraphStore()
