from typing import Any

from app.models.graph import GraphData, GraphEdge, GraphNode


def extract_from_rows(
    rows: list[dict[str, Any]],
    source_field: str,
    target_field: str,
    relation_field: str | None = None,
    weight_field: str | None = None,
) -> GraphData:
    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    for index, row in enumerate(rows):
        source = str(row.get(source_field, "")).strip()
        target = str(row.get(target_field, "")).strip()
        if not source or not target:
            continue
        nodes.setdefault(source, GraphNode(id=source, name=source, type=source_field, weight=10))
        nodes.setdefault(target, GraphNode(id=target, name=target, type=target_field, weight=10))
        relation = str(row.get(relation_field, relation_field or "关联")) if relation_field else "关联"
        weight = float(row.get(weight_field, 1) or 1) if weight_field else 1
        edges.append(GraphEdge(id=f"row-{index}", source=source, target=target, relation_type=relation, weight=weight, properties=row))

    return GraphData(nodes=list(nodes.values()), edges=edges)
