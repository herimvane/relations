from io import BytesIO
from typing import Any

import pandas as pd

from app.models.graph import GraphData, GraphEdge, GraphNode


KNOWN_NODE_COLUMNS = {"id", "name", "type", "group", "weight"}
KNOWN_EDGE_COLUMNS = {"id", "source", "target", "relation_type", "weight"}


def _clean(value: Any, default: Any = None) -> Any:
    if pd.isna(value):
        return default
    return value


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
        props = {key: _clean(row[key]) for key in nodes_df.columns if key not in KNOWN_NODE_COLUMNS and _clean(row[key], "") != ""}
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
        props = {key: _clean(row[key]) for key in edges_df.columns if key not in KNOWN_EDGE_COLUMNS and _clean(row[key], "") != ""}
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
