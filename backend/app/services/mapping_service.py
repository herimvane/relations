from typing import Any

from app.models.graph import GraphEdge, GraphNode


def map_node(row: dict[str, Any], mapping: dict[str, str]) -> GraphNode:
    node_id = str(row.get(mapping.get("id", "id"), "")).strip()
    return GraphNode(
        id=node_id,
        name=str(row.get(mapping.get("name", "name"), node_id)),
        type=str(row.get(mapping.get("type", "type"), "未知")),
        group=str(row.get(mapping.get("group", "group"), "")) or None,
        weight=float(row.get(mapping.get("weight", "weight"), 1) or 1),
        properties={key: value for key, value in row.items() if key not in mapping.values()},
    )


def map_edge(row: dict[str, Any], mapping: dict[str, str], index: int) -> GraphEdge:
    return GraphEdge(
        id=str(row.get(mapping.get("id", "id"), f"edge-{index}")),
        source=str(row.get(mapping.get("source", "source"), "")).strip(),
        target=str(row.get(mapping.get("target", "target"), "")).strip(),
        relation_type=str(row.get(mapping.get("relation_type", "relation_type"), "关联")),
        weight=float(row.get(mapping.get("weight", "weight"), 1) or 1),
        properties={key: value for key, value in row.items() if key not in mapping.values()},
    )
