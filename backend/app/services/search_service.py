from __future__ import annotations

from sqlalchemy import text

from app.core.datasource_config import dataset_config, postgres_config
from app.models.graph import GraphEdge, GraphNode
from app.models.search import GraphPath, NodeSearchResponse, NodeSearchResult, PathSearchResponse
from app.services.graph_view_service import _edge, _engine, _node, _safe_table


def _edge_key(edge: GraphEdge) -> str:
    return edge.id or f"{edge.source}->{edge.target}:{edge.relation_type}"


def search_nodes(dataset: str, query: str, limit: int = 20) -> NodeSearchResponse:
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    normalized = query.strip()
    if not normalized:
        return NodeSearchResponse()

    pattern = f"%{normalized}%"
    with _engine(dataset).connect() as conn:
        rows = conn.execute(
            text(
                f"""
                select
                    n.*,
                    coalesce(d.degree, 0) as degree
                from {node_table} n
                left join (
                    select id, count(*) as degree
                    from (
                        select source as id from {edge_table}
                        union all
                        select target as id from {edge_table}
                    ) x
                    group by id
                ) d on d.id = n.id
                where n.id = :exact
                   or lower(n.name) = lower(:exact)
                   or n.id ilike :pattern
                   or n.name ilike :pattern
                   or n.type ilike :pattern
                   or coalesce(n."group", '') ilike :pattern
                order by
                    case when n.id = :exact or lower(n.name) = lower(:exact) then 0 else 1 end,
                    coalesce(n.importance_score, 0) desc,
                    coalesce(d.degree, 0) desc,
                    n.weight desc
                limit :limit
                """
            ),
            {"exact": normalized, "pattern": pattern, "limit": limit},
        ).all()

    results = []
    for row in rows:
        node = _node(row)
        results.append(NodeSearchResult(**node.model_dump(), degree=int(row._mapping.get("degree") or 0)))
    return NodeSearchResponse(results=results)


def _resolve_node(conn, node_table: str, query: str) -> GraphNode | None:
    normalized = query.strip()
    if not normalized:
        return None
    row = conn.execute(
        text(
            f"""
            select * from {node_table}
            where id = :exact
               or lower(name) = lower(:exact)
               or id ilike :pattern
               or name ilike :pattern
            order by
                case when id = :exact or lower(name) = lower(:exact) then 0 else 1 end,
                coalesce(importance_score, 0) desc,
                weight desc
            limit 1
            """
        ),
        {"exact": normalized, "pattern": f"%{normalized}%"},
    ).first()
    return _node(row) if row else None


def search_paths(dataset: str, source: str, target: str, max_depth: int = 4, max_paths: int = 8, max_branching: int = 48) -> PathSearchResponse:
    dataset_config(dataset)
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    max_depth = max(1, min(max_depth, 5))
    max_paths = max(1, min(max_paths, 20))
    max_branching = max(8, min(max_branching, 96))

    with _engine(dataset).connect() as conn:
        source_node = _resolve_node(conn, node_table, source)
        target_node = _resolve_node(conn, node_table, target)
        if not source_node or not target_node:
            return PathSearchResponse()

        node_cache: dict[str, GraphNode] = {source_node.id: source_node, target_node.id: target_node}
        edge_cache: dict[str, GraphEdge] = {}
        adjacency: dict[str, list[GraphEdge]] = {}
        frontier = {source_node.id}
        visited_for_fetch: set[str] = set()

        for _depth in range(max_depth):
            frontier = {node_id for node_id in frontier if node_id not in visited_for_fetch}
            if not frontier:
                break
            visited_for_fetch.update(frontier)
            rows = conn.execute(
                text(
                    f"""
                    select * from {edge_table}
                    where source = any(:frontier) or target = any(:frontier)
                    order by coalesce(importance_score, weight / 100.0) desc, weight desc
                    limit :limit
                    """
                ),
                {"frontier": list(frontier), "limit": max(200, len(frontier) * max_branching)},
            ).all()
            next_frontier: set[str] = set()
            for row in rows:
                edge = _edge(row)
                key = _edge_key(edge)
                edge_cache[key] = edge
                adjacency.setdefault(edge.source, []).append(edge)
                adjacency.setdefault(edge.target, []).append(edge)
                if edge.source not in visited_for_fetch:
                    next_frontier.add(edge.source)
                if edge.target not in visited_for_fetch:
                    next_frontier.add(edge.target)
            if target_node.id in next_frontier:
                break
            frontier = next_frontier

        for edges in adjacency.values():
            edges.sort(key=lambda item: item.weight, reverse=True)

        stack: list[tuple[str, list[str], list[GraphEdge], set[str]]] = [(source_node.id, [source_node.id], [], {source_node.id})]
        raw_paths: list[tuple[list[str], list[GraphEdge]]] = []
        iterations = 0
        while stack and len(raw_paths) < max_paths and iterations < 20000:
            iterations += 1
            current, node_path, edge_path, seen = stack.pop()
            if len(edge_path) >= max_depth:
                continue
            for edge in adjacency.get(current, [])[:max_branching]:
                nxt = edge.target if edge.source == current else edge.source
                if nxt in seen:
                    continue
                next_nodes = [*node_path, nxt]
                next_edges = [*edge_path, edge]
                if nxt == target_node.id:
                    raw_paths.append((next_nodes, next_edges))
                    continue
                stack.append((nxt, next_nodes, next_edges, {*seen, nxt}))

        missing_node_ids = sorted({node_id for node_path, _ in raw_paths for node_id in node_path if node_id not in node_cache})
        if missing_node_ids:
            rows = conn.execute(text(f"select * from {node_table} where id = any(:node_ids)"), {"node_ids": missing_node_ids}).all()
            for row in rows:
                node = _node(row)
                node_cache[node.id] = node

    paths: list[GraphPath] = []
    for node_ids, edges in raw_paths:
        nodes = [node_cache[node_id] for node_id in node_ids if node_id in node_cache]
        score = sum(edge.weight for edge in edges) / max(1, len(edges))
        paths.append(GraphPath(id="|".join(_edge_key(edge) for edge in edges), nodes=nodes, edges=edges, score=score))

    paths.sort(key=lambda item: (-item.score, len(item.edges)))
    return PathSearchResponse(paths=paths[:max_paths])
