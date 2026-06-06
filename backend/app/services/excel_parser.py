from io import BytesIO
import json
from typing import Any

import pandas as pd

from app.models.graph import GraphData, GraphEdge, GraphNode


KNOWN_NODE_COLUMNS = {"id", "name", "type", "group", "weight"}
KNOWN_EDGE_COLUMNS = {"id", "source", "target", "relation_type", "weight"}


def _clean(value: Any, default: Any = None) -> Any:
    if pd.isna(value):
        return default
    return value


def _parse_properties(value: Any) -> dict[str, Any]:
    value = _clean(value, "")
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {"properties": value}
    return parsed if isinstance(parsed, dict) else {"properties": parsed}


def _row_properties(row: Any, columns: Any, known_columns: set[str]) -> dict[str, Any]:
    props = _parse_properties(row.get("properties", ""))
    for key in columns:
        if key in known_columns or key == "properties":
            continue
        value = _clean(row[key], "")
        if value != "":
            props[key] = value
    return props


def parse_excel(content: bytes) -> GraphData:
    workbook = pd.ExcelFile(BytesIO(content))
    sheet_names = {name.lower(): name for name in workbook.sheet_names}
    if "nodes" not in sheet_names or "edges" not in sheet_names:
        raise ValueError("Excel must include sheets named nodes and edges")

    nodes_df = workbook.parse(sheet_names["nodes"]).fillna("")
    edges_df = workbook.parse(sheet_names["edges"]).fillna("")

    nodes: list[GraphNode] = []
    for _, row in nodes_df.iterrows():
        node_id = str(_clean(row.get("id"), "")).strip()
        if not node_id:
            continue
        props = _row_properties(row, nodes_df.columns, KNOWN_NODE_COLUMNS)
        nodes.append(
            GraphNode(
                id=node_id,
                name=str(_clean(row.get("name"), node_id)),
                type=str(_clean(row.get("type"), "未知")),
                group=str(_clean(row.get("group"), "")) or None,
                weight=float(_clean(row.get("weight"), 1) or 1),
                properties=props,
            )
        )

    edges: list[GraphEdge] = []
    for index, row in edges_df.iterrows():
        source = str(_clean(row.get("source"), "")).strip()
        target = str(_clean(row.get("target"), "")).strip()
        if not source or not target:
            continue
        props = _row_properties(row, edges_df.columns, KNOWN_EDGE_COLUMNS)
        edges.append(
            GraphEdge(
                id=str(_clean(row.get("id"), f"e-{index}")),
                source=source,
                target=target,
                relation_type=str(_clean(row.get("relation_type"), "关联")),
                weight=float(_clean(row.get("weight"), 1) or 1),
                properties=props,
            )
        )

    return GraphData(nodes=nodes, edges=edges)
