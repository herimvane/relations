from __future__ import annotations

import argparse
import getpass
import json
import math
import random
import time
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


SOCIAL_TYPES = ["人物", "组织", "公司", "地点", "事件"]
ENTERPRISE_TYPES = ["公司", "自然人", "资产", "项目", "地址", "电话"]

SURNAMES = list("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹")
GIVEN_A = list("承明景云星雨嘉子文思若清安亦书泽宸宇知远昱锦怀庭修南北东映舒鸣瑾熙芷语梦宁欣可依佳一")
GIVEN_B = list("轩辰妍泽宁舟然鸣禾阳月川临白青遥澄晗笙琪瑶珩玥衡墨岚棠熹沐言予知")
COMPANY_PREFIX = ["星河", "华信", "远桥", "恒宁", "启明", "北辰", "中融", "嘉禾", "云岭", "海岳", "盛源", "东泽", "明德", "瑞通", "万象", "青岚", "金石", "融泰"]
COMPANY_SUFFIX = ["科技", "投资", "控股", "贸易", "实业", "供应链", "资本", "资产", "咨询", "制造", "能源", "地产", "医药", "物流"]
ORG_PREFIX = ["第一", "第二", "明德", "启航", "星域", "远桥", "青禾", "北辰", "南湖", "云海"]
LOCATIONS = ["北京", "上海", "深圳", "杭州", "南京", "成都", "武汉", "广州", "苏州", "重庆", "西安", "天津", "青岛", "厦门", "长沙", "宁波"]
INDUSTRIES = ["金融", "地产", "制造", "医药", "科技", "能源", "物流", "消费", "教育", "文旅", "农业", "材料"]
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


@dataclass
class NodeRow:
    id: str
    name: str
    type: str
    group: str
    weight: float
    properties: dict
    community_id: str
    business_weight: float


@dataclass(frozen=True)
class EdgeRow:
    id: str
    source_index: int
    target_index: int
    relation_type: str
    weight: float
    properties: dict


def safe_name(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise ValueError(f"Unsafe SQL identifier: {value}")
    return f'"{value}"'


def build_url(args: argparse.Namespace, database: str | None = None) -> URL:
    return URL.create(
        "postgresql+psycopg",
        username=args.username,
        password=args.password or None,
        host=args.host,
        port=args.port,
        database=database or args.database,
    )


def random_person_name(rng: random.Random, index: int) -> str:
    surname = rng.choice(SURNAMES)
    if rng.random() < 0.72:
        return f"{surname}{rng.choice(GIVEN_A)}{rng.choice(GIVEN_B)}"
    return f"{surname}{rng.choice(GIVEN_A)}"


def company_name(rng: random.Random, index: int) -> str:
    return f"{rng.choice(LOCATIONS)}{rng.choice(COMPANY_PREFIX)}{rng.choice(COMPANY_SUFFIX)}有限公司"


def weighted_choice(rng: random.Random, items: list[tuple[str, float]]) -> str:
    total = sum(weight for _, weight in items)
    cursor = rng.random() * total
    acc = 0.0
    for item, weight in items:
        acc += weight
        if cursor <= acc:
            return item
    return items[-1][0]


def choose_other_in_community(rng: random.Random, community_members: list[list[int]], community_id: int, source: int) -> int:
    members = community_members[community_id]
    if len(members) <= 1:
        return source
    target = source
    while target == source:
        target = rng.choice(members)
    return target


def generate_nodes(dataset: str, count: int, community_count: int, rng: random.Random) -> list[NodeRow]:
    nodes: list[NodeRow] = []
    type_weights = (
        [("人物", 0.82), ("组织", 0.05), ("公司", 0.06), ("地点", 0.04), ("事件", 0.03)]
        if dataset == "social"
        else [("公司", 0.48), ("自然人", 0.28), ("资产", 0.08), ("项目", 0.07), ("地址", 0.05), ("电话", 0.04)]
    )
    for index in range(count):
        community = index % community_count
        node_type = weighted_choice(rng, type_weights)
        group = f"社区{community:03d}" if dataset == "social" else f"{rng.choice(INDUSTRIES)}集团{community:03d}"
        if dataset == "social":
            if node_type == "人物":
                name = random_person_name(rng, index)
            elif node_type == "公司":
                name = company_name(rng, index)
            elif node_type == "组织":
                name = f"{rng.choice(LOCATIONS)}{rng.choice(ORG_PREFIX)}协会"
            elif node_type == "地点":
                name = f"{rng.choice(LOCATIONS)}{rng.choice(['中心', '园区', '校区', '街区'])}{index % 300}"
            else:
                name = f"{rng.choice(['论坛', '展会', '项目会', '公益活动'])}{index % 500}"
        else:
            if node_type == "公司":
                name = company_name(rng, index)
            elif node_type == "自然人":
                name = random_person_name(rng, index)
            elif node_type == "资产":
                name = f"{rng.choice(LOCATIONS)}{rng.choice(['厂房', '写字楼', '仓储', '土地'])}{index % 1000}"
            elif node_type == "项目":
                name = f"{rng.choice(INDUSTRIES)}项目{index % 2000:04d}"
            elif node_type == "地址":
                name = f"{rng.choice(LOCATIONS)}市{rng.choice(['解放路', '星河路', '金融街', '科技大道'])}{index % 800}号"
            else:
                name = f"1{rng.randint(30, 99)}****{index % 10000:04d}"
        business_weight = rng.betavariate(2.2, 5.6)
        if index < max(20, community_count // 2):
            business_weight = 0.85 + rng.random() * 0.15
        risk = weighted_choice(rng, [("LOW", 0.74), ("MEDIUM", 0.17), ("HIGH", 0.07), ("CRITICAL", 0.02)])
        if risk in {"HIGH", "CRITICAL"}:
            business_weight = max(business_weight, 0.62 + rng.random() * 0.25)
        node_id = f"{'soc' if dataset == 'social' else 'ent'}_n{index:06d}"
        nodes.append(
            NodeRow(
                id=node_id,
                name=name,
                type=node_type,
                group=group,
                weight=round(20 + business_weight * 80, 3),
                properties={
                    "dataset": dataset,
                    "community_id": f"c{community:03d}",
                    "risk_level": risk,
                    "business_weight": round(business_weight, 6),
                    "source": "synthetic_realistic_benchmark",
                },
                community_id=f"c{community:03d}",
                business_weight=business_weight,
            )
        )
    return nodes


def build_community_members(nodes: list[NodeRow], community_count: int) -> list[list[int]]:
    members = [[] for _ in range(community_count)]
    for index, node in enumerate(nodes):
        members[int(node.community_id[1:])].append(index)
    return members


def generate_edges(dataset: str, nodes: list[NodeRow], target_edges: int, community_count: int, rng: random.Random) -> tuple[list[EdgeRow], list[int], list[float]]:
    community_members = build_community_members(nodes, community_count)
    degree = [0 for _ in nodes]
    strength = [0.0 for _ in nodes]
    edges: list[EdgeRow] = []
    seen: set[tuple[int, int, str]] = set()
    relation_weights = (
        [("好友", 0.32), ("同事", 0.18), ("同学", 0.13), ("亲属", 0.08), ("组织成员", 0.1), ("共同事件", 0.09), ("交易往来", 0.06), ("关注", 0.04)]
        if dataset == "social"
        else [("持股", 0.22), ("控制", 0.08), ("任职", 0.18), ("投资", 0.16), ("担保", 0.1), ("关联交易", 0.1), ("共同地址", 0.09), ("共同电话", 0.07)]
    )
    relation_base = {
        "控制": 88,
        "持股": 78,
        "担保": 76,
        "投资": 72,
        "任职": 66,
        "关联交易": 62,
        "亲属": 74,
        "交易往来": 58,
        "共同事件": 52,
        "同事": 48,
        "同学": 42,
        "好友": 38,
        "组织成员": 44,
        "共同地址": 32,
        "共同电话": 28,
        "关注": 24,
    }
    hub_count = max(100, len(nodes) // 250)
    hubs = list(range(hub_count))

    attempts = 0
    max_attempts = target_edges * 8
    while len(edges) < target_edges and attempts < max_attempts:
        attempts += 1
        if rng.random() < 0.18:
            source = rng.choice(hubs)
        else:
            source = rng.randrange(len(nodes))
        source_community = int(nodes[source].community_id[1:])
        roll = rng.random()
        if roll < 0.78:
            target = choose_other_in_community(rng, community_members, source_community, source)
        elif roll < 0.92:
            bridge_community = (source_community + rng.randint(1, min(12, community_count - 1))) % community_count
            target = rng.choice(community_members[bridge_community])
        else:
            target = rng.randrange(len(nodes))
        if target == source:
            continue
        relation = weighted_choice(rng, relation_weights)
        key = (source, target, relation)
        if key in seen:
            continue
        seen.add(key)
        base = relation_base.get(relation, 40)
        weight = max(1, min(100, rng.gauss(base, 14)))
        degree[source] += 1
        degree[target] += 1
        strength[source] += weight
        strength[target] += weight
        edges.append(
            EdgeRow(
                id=f"{'soc' if dataset == 'social' else 'ent'}_e{len(edges):08d}",
                source_index=source,
                target_index=target,
                relation_type=relation,
                weight=round(weight, 3),
                properties={
                    "dataset": dataset,
                    "same_community": nodes[source].community_id == nodes[target].community_id,
                    "confidence": round(0.55 + rng.random() * 0.44, 4),
                    "evidence_count": rng.randint(1, 12),
                },
            )
        )
    if len(edges) < target_edges:
        print(f"Warning: generated {len(edges)} edges, requested {target_edges}.")
    return edges, degree, strength


def apply_initial_importance(nodes: list[NodeRow], edges: list[EdgeRow], degree: list[int], strength: list[float]) -> None:
    max_degree = max(degree) or 1
    max_strength = max(strength) or 1.0
    community_max: dict[str, int] = {}
    for node, node_degree in zip(nodes, degree):
        community_max[node.community_id] = max(community_max.get(node.community_id, 0), node_degree)
    for index, node in enumerate(nodes):
        degree_score = degree[index] / max_degree
        weighted_degree_score = strength[index] / max_strength
        community_score = degree[index] / max(1, community_max[node.community_id])
        business_score = node.business_weight
        pagerank_seed = 0.55 * weighted_degree_score + 0.45 * business_score
        betweenness_seed = 0.7 * degree_score + 0.3 * (1 if index < max(100, len(nodes) // 250) else 0)
        importance = 0.35 * pagerank_seed + 0.25 * betweenness_seed + 0.15 * weighted_degree_score + 0.15 * community_score + 0.10 * business_score
        node.properties.update(
            {
                "degree": degree[index],
                "strength": round(strength[index], 6),
                "pagerank_score": round(pagerank_seed, 6),
                "betweenness_score": round(betweenness_seed, 6),
                "degree_score": round(degree_score, 6),
                "weighted_degree_score": round(weighted_degree_score, 6),
                "community_centrality_score": round(community_score, 6),
                "importance_score": round(importance, 6),
            }
        )
        node.weight = round(20 + importance * 80, 3)


def edge_importance(edge: EdgeRow, nodes: list[NodeRow]) -> float:
    source_importance = float(nodes[edge.source_index].properties["importance_score"])
    target_importance = float(nodes[edge.target_index].properties["importance_score"])
    relation_priority = {
        "控制": 1.0,
        "持股": 0.86,
        "担保": 0.82,
        "投资": 0.76,
        "任职": 0.64,
        "亲属": 0.72,
        "交易往来": 0.58,
        "好友": 0.38,
    }.get(edge.relation_type, 0.42)
    return 0.3 * (edge.weight / 100) + 0.2 * ((source_importance + target_importance) / 2) + 0.15 * relation_priority


def ensure_database(args: argparse.Namespace) -> None:
    admin_engine = create_engine(build_url(args, "postgres"), isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    with admin_engine.connect() as conn:
        exists = conn.execute(text("select 1 from pg_database where datname = :database"), {"database": args.database}).scalar()
        if not exists:
            conn.execute(text(f'create database "{args.database}"'))


def create_schema(conn, schema: str, node_table: str, edge_table: str) -> None:
    conn.execute(text(f"create schema if not exists {schema}"))
    conn.execute(
        text(
            f"""
            create table if not exists {node_table} (
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
            """
        )
    )
    conn.execute(
        text(
            f"""
            create table if not exists {edge_table} (
                id text primary key,
                source text not null,
                target text not null,
                relation_type text not null default '关联',
                weight double precision not null default 1,
                properties jsonb not null default '{{}}'::jsonb,
                importance_score double precision,
                computed_at timestamptz default now()
            )
            """
        )
    )
    conn.execute(text(f"create index if not exists idx_nodes_community on {node_table} (community_id)"))
    conn.execute(text(f"create index if not exists idx_nodes_type on {node_table} (type)"))
    conn.execute(text(f"create index if not exists idx_nodes_importance on {node_table} (importance_score desc)"))
    conn.execute(text(f"create index if not exists idx_edges_source on {edge_table} (source)"))
    conn.execute(text(f"create index if not exists idx_edges_target on {edge_table} (target)"))
    conn.execute(text(f"create index if not exists idx_edges_relation on {edge_table} (relation_type)"))
    conn.execute(text(f"create index if not exists idx_edges_importance on {edge_table} (importance_score desc)"))


def batched(items: list, size: int) -> Iterable[list]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def insert_data(args: argparse.Namespace, nodes: list[NodeRow], edges: list[EdgeRow]) -> None:
    schema = safe_name(args.schema)
    node_table = f"{schema}.{safe_name(args.node_table)}"
    edge_table = f"{schema}.{safe_name(args.edge_table)}"
    engine = create_engine(build_url(args), pool_pre_ping=True)
    with engine.begin() as conn:
        create_schema(conn, schema, node_table, edge_table)
        if args.replace:
            conn.execute(text(f"truncate table {edge_table}, {node_table}"))
        for batch in batched(nodes, args.batch_size):
            conn.execute(
                text(
                    f"""
                    insert into {node_table} (id, name, type, "group", weight, properties, community_id, importance_score)
                    values (:id, :name, :type, :group, :weight, cast(:properties as jsonb), :community_id, :importance_score)
                    on conflict (id) do update set
                        name = excluded.name,
                        type = excluded.type,
                        "group" = excluded."group",
                        weight = excluded.weight,
                        properties = excluded.properties,
                        community_id = excluded.community_id,
                        importance_score = excluded.importance_score,
                        computed_at = now()
                    """
                ),
                [
                    {
                        "id": node.id,
                        "name": node.name,
                        "type": node.type,
                        "group": node.group,
                        "weight": node.weight,
                        "properties": json.dumps(node.properties, ensure_ascii=False),
                        "community_id": node.community_id,
                        "importance_score": node.properties["importance_score"],
                    }
                    for node in batch
                ],
            )
        for batch in batched(edges, args.batch_size):
            conn.execute(
                text(
                    f"""
                    insert into {edge_table} (id, source, target, relation_type, weight, properties, importance_score)
                    values (:id, :source, :target, :relation_type, :weight, cast(:properties as jsonb), :importance_score)
                    on conflict (id) do update set
                        source = excluded.source,
                        target = excluded.target,
                        relation_type = excluded.relation_type,
                        weight = excluded.weight,
                        properties = excluded.properties,
                        importance_score = excluded.importance_score,
                        computed_at = now()
                    """
                ),
                [
                    {
                        "id": edge.id,
                        "source": nodes[edge.source_index].id,
                        "target": nodes[edge.target_index].id,
                        "relation_type": edge.relation_type,
                        "weight": edge.weight,
                        "properties": json.dumps(edge.properties, ensure_ascii=False),
                        "importance_score": round(edge_importance(edge, nodes), 6),
                    }
                    for edge in batch
                ],
            )
        conn.execute(text(f"analyze {node_table}"))
        conn.execute(text(f"analyze {edge_table}"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed PostgreSQL with large synthetic-but-realistic graph data.")
    parser.add_argument("--dataset", choices=["social", "enterprise"], required=True)
    parser.add_argument("--nodes", type=int, default=100_000)
    parser.add_argument("--edges", type=int, default=800_000)
    parser.add_argument("--communities", type=int, default=220)
    parser.add_argument("--seed", type=int, default=20260607)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--database", required=True)
    parser.add_argument("--username", default=getpass.getuser())
    parser.add_argument("--password", default="")
    parser.add_argument("--schema", default="public")
    parser.add_argument("--node-table", default="nodes")
    parser.add_argument("--edge-table", default="edges")
    parser.add_argument("--batch-size", type=int, default=5000)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--create-database", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start = time.perf_counter()
    if args.create_database:
        ensure_database(args)
    rng = random.Random(args.seed + (11 if args.dataset == "social" else 29))
    print(f"Generating {args.dataset}: {args.nodes} nodes / {args.edges} edges / {args.communities} communities")
    nodes = generate_nodes(args.dataset, args.nodes, args.communities, rng)
    edges, degree, strength = generate_edges(args.dataset, nodes, args.edges, args.communities, rng)
    apply_initial_importance(nodes, edges, degree, strength)
    print(f"Writing to PostgreSQL database={args.database} table={args.node_table}/{args.edge_table}")
    insert_data(args, nodes, edges)
    elapsed = time.perf_counter() - start
    print(f"Seeded {len(nodes)} nodes and {len(edges)} edges into {args.database} in {elapsed:.1f}s.")


if __name__ == "__main__":
    main()
