from io import BytesIO

import pandas as pd

from app.models.graph import GraphData, GraphEdge, GraphNode
from app.services.excel_parser import KNOWN_EDGE_COLUMNS, KNOWN_NODE_COLUMNS, _row_properties


def parse_csv(nodes_content: bytes | None, edges_content: bytes | None) -> GraphData:
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    if nodes_content:
        nodes_df = pd.read_csv(BytesIO(nodes_content)).fillna("")
        for _, row in nodes_df.iterrows():
            node_id = str(row.get("id", "")).strip()
            if not node_id:
                continue
            props = _row_properties(row, nodes_df.columns, KNOWN_NODE_COLUMNS)
            nodes.append(
                GraphNode(
                    id=node_id,
                    name=str(row.get("name", node_id)),
                    type=str(row.get("type", "未知")),
                    group=str(row.get("group", "")) or None,
                    weight=float(row.get("weight", 1) or 1),
                    properties=props,
                )
            )

    if edges_content:
        edges_df = pd.read_csv(BytesIO(edges_content)).fillna("")
        for index, row in edges_df.iterrows():
            source = str(row.get("source", "")).strip()
            target = str(row.get("target", "")).strip()
            if not source or not target:
                continue
            props = _row_properties(row, edges_df.columns, KNOWN_EDGE_COLUMNS)
            edges.append(
                GraphEdge(
                    id=str(row.get("id", f"e-{index}")),
                    source=source,
                    target=target,
                    relation_type=str(row.get("relation_type", "关联")),
                    weight=float(row.get("weight", 1) or 1),
                    properties=props,
                )
            )

    if not nodes:
        ids = sorted({edge.source for edge in edges} | {edge.target for edge in edges})
        nodes = [GraphNode(id=node_id, name=node_id, type="自动实体", weight=10) for node_id in ids]

    return GraphData(nodes=nodes, edges=edges)
