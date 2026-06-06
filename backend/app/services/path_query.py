from app.models.graph import GraphData, GraphEdge


def _resolve_node_id(graph: GraphData, text: str) -> str | None:
    normalized = text.strip().lower()
    if not normalized:
        return None
    exact = next((node for node in graph.nodes if node.id.lower() == normalized or node.name.lower() == normalized), None)
    if exact:
        return exact.id
    fuzzy = next((node for node in graph.nodes if normalized in node.name.lower() or normalized in node.id.lower()), None)
    return fuzzy.id if fuzzy else None


def _edge_key(edge: GraphEdge) -> str:
    return edge.id or f"{edge.source}-{edge.target}-{edge.relation_type}"


def find_path(graph: GraphData, source: str, target: str, max_depth: int = 4, max_paths: int = 12) -> GraphData:
    source_id = _resolve_node_id(graph, source)
    target_id = _resolve_node_id(graph, target)
    if not source_id or not target_id:
        return GraphData()

    adjacency: dict[str, list[GraphEdge]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge)
        adjacency.setdefault(edge.target, []).append(edge)

    for edges in adjacency.values():
        edges.sort(key=lambda item: item.weight, reverse=True)

    paths: list[tuple[list[str], list[GraphEdge]]] = []
    stack: list[tuple[str, list[str], list[GraphEdge], set[str]]] = [(source_id, [source_id], [], {source_id})]
    iterations = 0
    while stack and len(paths) < max_paths and iterations < 25000:
        iterations += 1
        current, node_path, edge_path, seen = stack.pop()
        if len(edge_path) >= max_depth:
            continue
        for edge in adjacency.get(current, [])[:80]:
            nxt = edge.target if edge.source == current else edge.source
            if nxt in seen:
                continue
            next_nodes = [*node_path, nxt]
            next_edges = [*edge_path, edge]
            if nxt == target_id:
                paths.append((next_nodes, next_edges))
                continue
            stack.append((nxt, next_nodes, next_edges, {*seen, nxt}))

    if not paths:
        return GraphData()

    node_ids: set[str] = set()
    edge_keys: set[str] = set()
    for node_path, edge_path in paths:
        node_ids.update(node_path)
        edge_keys.update(_edge_key(edge) for edge in edge_path)

    nodes = [node for node in graph.nodes if node.id in node_ids]
    edges = [edge for edge in graph.edges if _edge_key(edge) in edge_keys]
    return GraphData(nodes=nodes, edges=edges)
