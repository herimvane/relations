from collections import deque

from app.models.graph import GraphData


def find_path(graph: GraphData, source: str, target: str, max_depth: int = 4) -> GraphData:
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge.target)
        adjacency.setdefault(edge.target, []).append(edge.source)

    queue = deque([(source, [source])])
    visited = {source}
    result_path: list[str] = []

    while queue:
        current, path = queue.popleft()
        if current == target:
            result_path = path
            break
        if len(path) > max_depth + 1:
            continue
        for nxt in adjacency.get(current, []):
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, [*path, nxt]))

    if not result_path:
        return GraphData()

    path_ids = set(result_path)
    edges = [
        edge
        for edge in graph.edges
        if edge.source in path_ids
        and edge.target in path_ids
        and abs(result_path.index(edge.source) - result_path.index(edge.target)) == 1
    ]
    nodes = [node for node in graph.nodes if node.id in path_ids]
    return GraphData(nodes=nodes, edges=edges)
