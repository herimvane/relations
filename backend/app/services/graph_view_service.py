from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from app.core.datasource_config import dataset_config, postgres_config
from app.models.graph import GraphEdge, GraphNode
from app.models.view import CommunitySummary, GraphViewResponse, ViewStats


def _engine(dataset: str):
    data = dataset_config(dataset)
    config = postgres_config()
    return create_engine(
        URL.create(
            "postgresql+psycopg",
            username=config.username,
            password=config.password or None,
            host=config.host,
            port=config.port,
            database=data.database,
        ),
        pool_pre_ping=True,
    )


def _safe_table(table: str) -> str:
    config = postgres_config()
    schema = config.schema
    if not schema.replace("_", "").isalnum() or not table.replace("_", "").isalnum():
        raise ValueError("Unsafe table name")
    return f'"{schema}"."{table}"'


def _node(row) -> GraphNode:
    mapping = row._mapping
    props = dict(mapping.get("properties") or {})
    if mapping.get("community_id") is not None:
        props.setdefault("community_id", mapping["community_id"])
    if mapping.get("importance_score") is not None:
        props.setdefault("importance_score", float(mapping["importance_score"]))
    return GraphNode(
        id=str(mapping["id"]),
        name=str(mapping["name"]),
        type=str(mapping["type"]),
        group=mapping.get("group"),
        weight=float(mapping.get("weight") or 1),
        properties=props,
    )


def _edge(row) -> GraphEdge:
    mapping = row._mapping
    props = dict(mapping.get("properties") or {})
    if mapping.get("importance_score") is not None:
        props.setdefault("importance_score", float(mapping["importance_score"]))
    return GraphEdge(
        id=str(mapping["id"]) if mapping.get("id") is not None else None,
        source=str(mapping["source"]),
        target=str(mapping["target"]),
        relation_type=str(mapping["relation_type"]),
        weight=float(mapping.get("weight") or 1),
        properties=props,
    )


def _stats(conn, node_table: str, edge_table: str, visible_nodes: int, visible_edges: int) -> ViewStats:
    total_nodes = int(conn.execute(text(f"select count(*) from {node_table}")).scalar() or 0)
    total_edges = int(conn.execute(text(f"select count(*) from {edge_table}")).scalar() or 0)
    return ViewStats(
        total_nodes=total_nodes,
        total_edges=total_edges,
        visible_nodes=visible_nodes,
        visible_edges=visible_edges,
        hidden_nodes=max(0, total_nodes - visible_nodes),
    )


def universe(dataset: str = "social", limit: int = 220, edge_limit: int = 180) -> GraphViewResponse:
    data = dataset_config(dataset)
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    with _engine(dataset).connect() as conn:
        community_rows = conn.execute(
            text(
                f"""
                select
                    community_id,
                    count(*) as node_count,
                    avg(coalesce(importance_score, 0)) as avg_importance,
                    max(coalesce(importance_score, 0)) as max_importance
                from {node_table}
                group by community_id
                order by max(coalesce(importance_score, 0)) desc, count(*) desc
                limit :limit
                """
            ),
            {"limit": limit},
        ).all()
        communities = [
            CommunitySummary(
                id=row._mapping["community_id"],
                name=f"{data.title} {row._mapping['community_id']}",
                node_count=int(row._mapping["node_count"]),
                importance=float(row._mapping["max_importance"] or row._mapping["avg_importance"] or 0),
            )
            for row in community_rows
        ]
        community_ids = [item.id for item in communities]
        if not community_ids:
            return GraphViewResponse(view_level="L0", title=data.title, nodes=[], edges=[])
        nodes = [
            GraphNode(
                id=f"community:{item.id}",
                name=item.name,
                type="社区",
                group=item.id,
                weight=max(20, min(100, 20 + item.importance * 80)),
                properties={"community_id": item.id, "node_count": item.node_count, "importance_score": item.importance},
            )
            for item in communities
        ]
        edge_rows = conn.execute(
            text(
                f"""
                select
                    sn.community_id as source_community,
                    tn.community_id as target_community,
                    count(*) as edge_count,
                    avg(e.weight) as avg_weight
                from {edge_table} e
                join {node_table} sn on sn.id = e.source
                join {node_table} tn on tn.id = e.target
                where sn.community_id <> tn.community_id
                  and sn.community_id = any(:community_ids)
                  and tn.community_id = any(:community_ids)
                group by sn.community_id, tn.community_id
                order by count(*) desc
                limit :edge_limit
                """
            ),
            {"community_ids": community_ids, "edge_limit": edge_limit},
        ).all()
        edges = [
            GraphEdge(
                id=f"community-edge:{row._mapping['source_community']}:{row._mapping['target_community']}:{index}",
                source=f"community:{row._mapping['source_community']}",
                target=f"community:{row._mapping['target_community']}",
                relation_type="跨社区关系",
                weight=float(row._mapping["avg_weight"] or 1),
                properties={"edge_count": int(row._mapping["edge_count"])},
            )
            for index, row in enumerate(edge_rows)
        ]
        stats = _stats(conn, node_table, edge_table, len(nodes), len(edges))
    return GraphViewResponse(view_level="L0", title=f"{data.title} / Universe", nodes=nodes, edges=edges, communities=communities, stats=stats)


def galaxy(dataset: str, community_id: str, limit: int = 1000) -> GraphViewResponse:
    data = dataset_config(dataset)
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    with _engine(dataset).connect() as conn:
        node_rows = conn.execute(
            text(
                f"""
                select * from {node_table}
                where community_id = :community_id
                order by coalesce(importance_score, 0) desc, weight desc
                limit :limit
                """
            ),
            {"community_id": community_id, "limit": limit},
        ).all()
        nodes = [_node(row) for row in node_rows]
        node_ids = [node.id for node in nodes]
        edge_rows = conn.execute(
            text(
                f"""
                select * from {edge_table}
                where source = any(:node_ids) and target = any(:node_ids)
                order by coalesce(importance_score, weight / 100.0) desc, weight desc
                limit 5000
                """
            ),
            {"node_ids": node_ids},
        ).all() if node_ids else []
        edges = [_edge(row) for row in edge_rows]
        stats = _stats(conn, node_table, edge_table, len(nodes), len(edges))
    return GraphViewResponse(view_level="L1", title=f"{data.title} / Galaxy {community_id}", nodes=nodes, edges=edges, stats=stats)


def backbone(dataset: str, node_id: str, limit: int = 1000) -> GraphViewResponse:
    data = dataset_config(dataset)
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    with _engine(dataset).connect() as conn:
        seed_row = conn.execute(text(f"select * from {node_table} where id = :node_id"), {"node_id": node_id}).first()
        if not seed_row:
            return GraphViewResponse(view_level="L2", title=f"{data.title} / Backbone", nodes=[], edges=[])
        neighbor_rows = conn.execute(
            text(
                f"""
                with incident as (
                    select source as id from {edge_table} where target = :node_id
                    union
                    select target as id from {edge_table} where source = :node_id
                )
                select n.* from {node_table} n
                where n.id in (select id from incident) or n.id = :node_id
                order by case when n.id = :node_id then 1 else 0 end desc,
                         coalesce(n.importance_score, 0) desc,
                         n.weight desc
                limit :limit
                """
            ),
            {"node_id": node_id, "limit": limit},
        ).all()
        nodes = [_node(row) for row in neighbor_rows]
        node_ids = [node.id for node in nodes]
        edge_rows = conn.execute(
            text(
                f"""
                select * from {edge_table}
                where source = any(:node_ids) and target = any(:node_ids)
                order by case when source = :node_id or target = :node_id then 1 else 0 end desc,
                         coalesce(importance_score, weight / 100.0) desc,
                         weight desc
                limit 5000
                """
            ),
            {"node_ids": node_ids, "node_id": node_id},
        ).all() if node_ids else []
        edges = [_edge(row) for row in edge_rows]
        stats = _stats(conn, node_table, edge_table, len(nodes), len(edges))
    return GraphViewResponse(view_level="L2", title=f"{data.title} / Backbone {node_id}", nodes=nodes, edges=edges, stats=stats)


def local(dataset: str, node_id: str, limit: int = 1000) -> GraphViewResponse:
    data = dataset_config(dataset)
    config = postgres_config()
    node_table = _safe_table(config.node_table)
    edge_table = _safe_table(config.edge_table)
    with _engine(dataset).connect() as conn:
        candidate_rows = conn.execute(
            text(
                f"""
                with one_hop as (
                    select source as id from {edge_table} where target = :node_id
                    union
                    select target as id from {edge_table} where source = :node_id
                    limit :limit_plus_one
                ),
                two_hop as (
                    select case when e.source = one_hop.id then e.target else e.source end as id
                    from {edge_table} e
                    join one_hop on e.source = one_hop.id or e.target = one_hop.id
                    where case when e.source = one_hop.id then e.target else e.source end <> :node_id
                    limit :limit_plus_one
                ),
                candidate as (
                    select cast(:node_id as text) as id
                    union
                    select id from one_hop
                    union
                    select id from two_hop
                )
                select id from candidate
                limit :limit_plus_one
                """
            ),
            {"node_id": node_id, "limit_plus_one": limit + 1},
        ).all()
        candidate_ids = [str(row._mapping["id"]) for row in candidate_rows]
        complete = 0 < len(candidate_ids) <= limit

        if complete:
            node_rows = conn.execute(
                text(
                    f"""
                    select * from {node_table}
                    where id = any(:node_ids)
                    order by case when id = :node_id then 1 else 0 end desc,
                             coalesce(importance_score, 0) desc,
                             weight desc
                    """
                ),
                {"node_ids": candidate_ids, "node_id": node_id},
            ).all()
            nodes = [_node(row) for row in node_rows]
            node_ids = [node.id for node in nodes]
            edge_rows = conn.execute(
                text(
                    f"""
                    select * from {edge_table}
                    where source = any(:node_ids) and target = any(:node_ids)
                    order by case when source = :node_id or target = :node_id then 1 else 0 end desc,
                             coalesce(importance_score, weight / 100.0) desc,
                             weight desc
                    limit 10000
                    """
                ),
                {"node_ids": node_ids, "node_id": node_id},
            ).all() if node_ids else []
            edges = [_edge(row) for row in edge_rows]
            stats = _stats(conn, node_table, edge_table, len(nodes), len(edges))
            return GraphViewResponse(
                view_level="L3",
                title=f"{data.title} / Local {node_id}",
                nodes=nodes,
                edges=edges,
                can_drill=False,
                complete=True,
                stats=stats,
            )

        node_rows = conn.execute(
            text(
                f"""
                with incident as (
                    select source as id from {edge_table} where target = :node_id
                    union
                    select target as id from {edge_table} where source = :node_id
                    union
                    select :node_id as id
                )
                select n.* from {node_table} n
                where n.id in (select id from incident)
                order by case when n.id = :node_id then 1 else 0 end desc,
                         coalesce(n.importance_score, 0) desc,
                         n.weight desc
                limit :limit
                """
            ),
            {"node_id": node_id, "limit": limit},
        ).all()
        nodes = [_node(row) for row in node_rows]
        node_ids = [node.id for node in nodes]
        edge_rows = conn.execute(
            text(
                f"""
                select * from {edge_table}
                where (source = :node_id and target = any(:node_ids))
                   or (target = :node_id and source = any(:node_ids))
                order by coalesce(importance_score, weight / 100.0) desc, weight desc
                limit 5000
                """
            ),
            {"node_ids": node_ids, "node_id": node_id},
        ).all() if node_ids else []
        edges = [_edge(row) for row in edge_rows]
        stats = _stats(conn, node_table, edge_table, len(nodes), len(edges))
    return GraphViewResponse(
        view_level="L3",
        title=f"{data.title} / Local {node_id}",
        nodes=nodes,
        edges=edges,
        can_drill=True,
        complete=False,
        stats=stats,
    )
