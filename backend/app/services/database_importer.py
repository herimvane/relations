from __future__ import annotations

import json
import math
import random
import re
from collections import Counter, defaultdict, deque
from typing import Any, Iterable

import psycopg
from psycopg import sql

from app.core.datasource_config import active_dataset, dataset_config, postgres_config
from app.models.graph import GraphData, GraphEdge, GraphNode
from app.models.import_report import ImportReport, ImportTopNode
from app.services.importance import calculate_node_importance


def _node_community(node: GraphNode) -> str:
    value = node.properties.get("community_id") if node.properties else None
    return str(value or node.group or "").strip()


def _node_importance(node: GraphNode) -> float:
    value = node.properties.get("importance_score") if node.properties else None
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_identifier(value: str) -> sql.Identifier:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"Unsafe SQL identifier: {value}")
    return sql.Identifier(value)


def _table_ref(schema: str, table: str) -> sql.SQL:
    return sql.SQL("{}.{}").format(_safe_identifier(schema), _safe_identifier(table))


def _build_adjacency(edges: list[GraphEdge]) -> dict[str, list[tuple[str, float]]]:
    adjacency: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for edge in edges:
        weight = max(0.001, float(edge.weight or 1))
        adjacency[edge.source].append((edge.target, weight))
        adjacency[edge.target].append((edge.source, weight))
    return adjacency


def _connected_components(nodes: list[GraphNode], adjacency: dict[str, list[tuple[str, float]]]) -> dict[str, str]:
    labels: dict[str, str] = {}
    visited: set[str] = set()
    component_index = 0
    for node in nodes:
        if node.id in visited:
            continue
        component_index += 1
        label = f"community_{component_index:04d}"
        queue = deque([node.id])
        visited.add(node.id)
        while queue:
            current = queue.popleft()
            labels[current] = label
            for neighbor, _ in adjacency.get(current, []):
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                queue.append(neighbor)
    return labels


def _label_propagation(nodes: list[GraphNode], adjacency: dict[str, list[tuple[str, float]]], seed = 42, max_iter = 18) -> dict[str, str]:
    rng = random.Random(seed)
    labels = {node.id: node.id for node in nodes}
    node_ids = [node.id for node in nodes]
    for _ in range(max_iter):
        rng.shuffle(node_ids)
        changed = 0
        for node_id in node_ids:
            scores: dict[str, float] = defaultdict(float)
            for neighbor, weight in adjacency.get(node_id, []):
                scores[labels.get(neighbor, neighbor)] += weight
            if not scores:
                continue
            best_label = max(scores.items(), key=lambda item: (item[1], item[0]))[0]
            if labels[node_id] != best_label:
                labels[node_id] = best_label
                changed += 1
        if changed == 0:
            break
    ordered = {
        label: f"community_{index + 1:04d}"
        for index, (label, _) in enumerate(Counter(labels.values()).most_common())
    }
    return {node_id: ordered[label] for node_id, label in labels.items()}


def _normalize_communities(raw_labels: dict[str, str | int]) -> dict[str, str]:
    ordered = {
        label: f"community_{index + 1:04d}"
        for index, (label, _) in enumerate(Counter(raw_labels.values()).most_common())
    }
    return {node_id: ordered[label] for node_id, label in raw_labels.items()}


def _louvain_communities(nodes: list[GraphNode], edges: list[GraphEdge]) -> dict[str, str]:
    try:
        import networkx as nx
    except ImportError as exc:
        raise RuntimeError("Louvain requires networkx. Please install backend requirements again.") from exc

    graph = nx.Graph()
    graph.add_nodes_from(node.id for node in nodes)
    for edge in edges:
        weight = max(0.001, float(edge.weight or 1))
        if graph.has_edge(edge.source, edge.target):
            graph[edge.source][edge.target]["weight"] += weight
        else:
            graph.add_edge(edge.source, edge.target, weight=weight)

    if hasattr(nx.community, "louvain_communities"):
        communities = nx.community.louvain_communities(graph, weight="weight", seed=42)
        raw_labels = {
            node_id: index
            for index, community in enumerate(communities)
            for node_id in community
        }
        return _normalize_communities(raw_labels)

    try:
        import community as community_louvain
    except ImportError as exc:
        raise RuntimeError("Louvain requires networkx>=2.8 or python-louvain.") from exc

    partition = community_louvain.best_partition(graph, weight="weight", random_state=42)
    return _normalize_communities(partition)


def _leiden_communities(nodes: list[GraphNode], edges: list[GraphEdge]) -> dict[str, str]:
    try:
        import igraph as ig
        import leidenalg
    except ImportError as exc:
        raise RuntimeError("Leiden requires python-igraph and leidenalg. Please install backend requirements again.") from exc

    node_ids = [node.id for node in nodes]
    node_index = {node_id: index for index, node_id in enumerate(node_ids)}
    edge_weights: dict[tuple[int, int], float] = defaultdict(float)
    for edge in edges:
        source_index = node_index.get(edge.source)
        target_index = node_index.get(edge.target)
        if source_index is None or target_index is None or source_index == target_index:
            continue
        pair = tuple(sorted((source_index, target_index)))
        edge_weights[pair] += max(0.001, float(edge.weight or 1))

    graph = ig.Graph(n=len(node_ids), edges=list(edge_weights.keys()), directed=False)
    graph.vs["name"] = node_ids
    graph.es["weight"] = list(edge_weights.values())
    partition = leidenalg.find_partition(
        graph,
        leidenalg.RBConfigurationVertexPartition,
        weights="weight",
        seed=42,
    )
    raw_labels = {
        node_ids[node_index_value]: community_index
        for community_index, community in enumerate(partition)
        for node_index_value in community
    }
    return _normalize_communities(raw_labels)


def detect_communities(
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    adjacency: dict[str, list[tuple[str, float]]],
    community_method: str,
) -> dict[str, str]:
    existing = {node.id: _node_community(node) for node in nodes if _node_community(node)}
    if community_method == "existing" and existing:
        return existing
    if community_method == "connected":
        return _connected_components(nodes, adjacency)
    if community_method == "louvain":
        return _louvain_communities(nodes, edges)
    if community_method == "leiden":
        return _leiden_communities(nodes, edges)
    return _label_propagation(nodes, adjacency)


def _ensure_nodes(graph: GraphData) -> tuple[list[GraphNode], list[GraphEdge], list[str], int]:
    original_node_ids = {node.id for node in graph.nodes}
    missing_node_ids = sorted(({edge.source for edge in graph.edges} | {edge.target for edge in graph.edges}) - original_node_ids)
    nodes = list(graph.nodes)
    for node_id in missing_node_ids:
        nodes.append(GraphNode(id=node_id, name=node_id, type="自动实体", weight=10, properties={"auto_created": True}))
    valid_node_ids = {node.id for node in nodes}
    edges = [edge for edge in graph.edges if edge.source in valid_node_ids and edge.target in valid_node_ids and edge.source != edge.target]
    return nodes, edges, missing_node_ids, len([edge for edge in graph.edges if edge.source not in original_node_ids or edge.target not in original_node_ids])


def analyze_graph(
    graph: GraphData,
    community_method: str = "label",
    importance_template: str = "auto",
    importance_formula: dict[str, Any] | None = None,
) -> tuple[GraphData, ImportReport]:
    nodes, edges, missing_node_ids, missing_edge_count = _ensure_nodes(graph)
    adjacency = _build_adjacency(edges)
    labels = detect_communities(nodes, edges, adjacency, community_method)
    fallback = _connected_components(nodes, adjacency)

    degree: dict[str, int] = defaultdict(int)
    strength: dict[str, float] = defaultdict(float)
    for edge in edges:
        degree[edge.source] += 1
        degree[edge.target] += 1
        strength[edge.source] += float(edge.weight or 1)
        strength[edge.target] += float(edge.weight or 1)

    node_importance, importance_report = calculate_node_importance(
        nodes,
        edges,
        degree,
        strength,
        importance_template,
        importance_formula,
    )
    analyzed_nodes: list[GraphNode] = []
    for node in nodes:
        community_id = labels.get(node.id) or fallback.get(node.id) or "community_0000"
        importance = node_importance.get(node.id, 0)
        props = dict(node.properties or {})
        props.update({
            "community_id": community_id,
            "degree": degree[node.id],
            "strength": round(strength[node.id], 6),
            "importance_score": importance,
            "importance_template": importance_report["name"],
            "importance_formula": importance_report["formula"],
        })
        analyzed_nodes.append(
            GraphNode(
                id=node.id,
                name=node.name,
                type=node.type,
                group=node.group or community_id,
                weight=round(max(2, min(100, 8 + importance * 92)), 3),
                properties=props,
            )
        )

    node_by_id = {node.id: node for node in analyzed_nodes}
    analyzed_edges: list[GraphEdge] = []
    seen_edge_ids: set[str] = set()
    for index, edge in enumerate(edges):
        source_importance = _node_importance(node_by_id[edge.source])
        target_importance = _node_importance(node_by_id[edge.target])
        relation_score = min(1, math.log1p(max(0.001, float(edge.weight or 1))) / math.log1p(100))
        importance = round(0.45 * relation_score + 0.275 * source_importance + 0.275 * target_importance, 6)
        props = dict(edge.properties or {})
        props.update({
            "importance_score": importance,
            "same_community": _node_community(node_by_id[edge.source]) == _node_community(node_by_id[edge.target]),
        })
        edge_id = edge.id or f"e-{index:08d}"
        if edge_id in seen_edge_ids:
            suffix = 2
            while f"{edge_id}-{suffix}" in seen_edge_ids:
                suffix += 1
            edge_id = f"{edge_id}-{suffix}"
        seen_edge_ids.add(edge_id)
        analyzed_edges.append(
            GraphEdge(
                id=edge_id,
                source=edge.source,
                target=edge.target,
                relation_type=edge.relation_type,
                weight=edge.weight,
                properties=props,
            )
        )

    community_counts = Counter(_node_community(node) for node in analyzed_nodes)
    relation_counts = Counter(edge.relation_type for edge in analyzed_edges)
    isolated_nodes = sum(1 for node in analyzed_nodes if degree[node.id] == 0)
    top_nodes = sorted(analyzed_nodes, key=lambda node: _node_importance(node), reverse=True)[:12]
    warnings: list[str] = []
    if missing_node_ids:
        warnings.append(f"{len(missing_node_ids)} 个边端点未在 nodes 中声明，已自动补全为自动实体。")
    if isolated_nodes:
        warnings.append(f"{isolated_nodes} 个孤立节点不会在关系视图中形成边。")
    if importance_report["required_missing"]:
        warnings.append(f"重要度公式缺少必需字段：{', '.join(importance_report['required_missing'])}。")
    if importance_report["recommended_missing"]:
        warnings.append(f"重要度公式缺少推荐字段：{', '.join(importance_report['recommended_missing'])}，已按可用指标降级计算。")

    report = ImportReport(
        nodes=len(analyzed_nodes),
        edges=len(analyzed_edges),
        isolated_nodes=isolated_nodes,
        missing_endpoint_edges=missing_edge_count,
        missing_node_ids=missing_node_ids[:50],
        communities=len(community_counts),
        top_communities=community_counts.most_common(12),
        relation_types=relation_counts.most_common(16),
        top_nodes=[
            ImportTopNode(
                id=node.id,
                name=node.name,
                type=node.type,
                community_id=_node_community(node),
                degree=int(node.properties.get("degree", 0) if node.properties else 0),
                importance_score=_node_importance(node),
            )
            for node in top_nodes
        ],
        community_method=community_method,
        importance_template=importance_report["name"],
        importance_template_label=importance_report["label"],
        importance_template_status=importance_report["status"],
        importance_formula=importance_report["formula"],
        available_importance_fields=importance_report["available_fields"],
        missing_required_fields=importance_report["required_missing"],
        missing_recommended_fields=importance_report["recommended_missing"],
        warnings=warnings,
    )
    return GraphData(nodes=analyzed_nodes, edges=analyzed_edges), report


def _create_schema(cur: psycopg.Cursor, schema: str, node_table: str, edge_table: str) -> None:
    node_ref = _table_ref(schema, node_table)
    edge_ref = _table_ref(schema, edge_table)
    cur.execute(sql.SQL("create schema if not exists {}").format(_safe_identifier(schema)))
    cur.execute(sql.SQL("""
        create table if not exists {} (
            id text primary key,
            name text not null,
            type text not null,
            "group" text,
            weight double precision not null default 1,
            properties jsonb not null default '{{}}'::jsonb,
            community_id text,
            importance_score double precision,
            computed_at timestamptz default now()
        )
    """).format(node_ref))
    cur.execute(sql.SQL("""
        create table if not exists {} (
            id text primary key,
            source text not null,
            target text not null,
            relation_type text not null default '关联',
            weight double precision not null default 1,
            properties jsonb not null default '{{}}'::jsonb,
            importance_score double precision,
            computed_at timestamptz default now()
        )
    """).format(edge_ref))


def _create_indexes(cur: psycopg.Cursor, schema: str, node_table: str, edge_table: str) -> None:
    node_ref = _table_ref(schema, node_table)
    edge_ref = _table_ref(schema, edge_table)
    cur.execute(sql.SQL("create index if not exists idx_nodes_community on {} (community_id)").format(node_ref))
    cur.execute(sql.SQL("create index if not exists idx_nodes_type on {} (type)").format(node_ref))
    cur.execute(sql.SQL("create index if not exists idx_nodes_importance on {} (importance_score desc)").format(node_ref))
    cur.execute(sql.SQL("create index if not exists idx_edges_source on {} (source)").format(edge_ref))
    cur.execute(sql.SQL("create index if not exists idx_edges_target on {} (target)").format(edge_ref))
    cur.execute(sql.SQL("create index if not exists idx_edges_relation on {} (relation_type)").format(edge_ref))
    cur.execute(sql.SQL("create index if not exists idx_edges_importance on {} (importance_score desc)").format(edge_ref))


def _batched(items: list, size: int) -> Iterable[list]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def write_database(graph: GraphData, batch_size: int = 5000) -> None:
    dataset = dataset_config(active_dataset())
    config = postgres_config()
    node_ref = _table_ref(config.schema, config.node_table)
    edge_ref = _table_ref(config.schema, config.edge_table)
    with psycopg.connect(
        host=config.host,
        port=config.port,
        dbname=dataset.database,
        user=config.username,
        password=config.password,
    ) as conn:
        conn.execute("set statement_timeout = 0")
        with conn.cursor() as cur:
            _create_schema(cur, config.schema, config.node_table, config.edge_table)
            cur.execute(sql.SQL("truncate table {}, {}").format(edge_ref, node_ref))
            for batch in _batched(graph.nodes, batch_size):
                cur.executemany(
                    sql.SQL("""
                        insert into {} (id, name, type, "group", weight, properties, community_id, importance_score)
                        values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    """).format(node_ref),
                    [
                        (
                            node.id,
                            node.name,
                            node.type,
                            node.group,
                            node.weight,
                            json.dumps(node.properties or {}, ensure_ascii=False),
                            _node_community(node),
                            _node_importance(node),
                        )
                        for node in batch
                    ],
                )
            for batch in _batched(graph.edges, batch_size):
                cur.executemany(
                    sql.SQL("""
                        insert into {} (id, source, target, relation_type, weight, properties, importance_score)
                        values (%s, %s, %s, %s, %s, %s::jsonb, %s)
                    """).format(edge_ref),
                    [
                        (
                            edge.id,
                            edge.source,
                            edge.target,
                            edge.relation_type,
                            edge.weight,
                            json.dumps(edge.properties or {}, ensure_ascii=False),
                            float((edge.properties or {}).get("importance_score", 0) or 0),
                        )
                        for edge in batch
                    ],
                )
            _create_indexes(cur, config.schema, config.node_table, config.edge_table)
            cur.execute(sql.SQL("analyze {}").format(node_ref))
            cur.execute(sql.SQL("analyze {}").format(edge_ref))
        conn.commit()
