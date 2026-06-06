from __future__ import annotations

import argparse
import getpass
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


@dataclass(frozen=True)
class Person:
    id: str
    name: str
    type: str
    group: str
    weight: int
    properties: dict[str, Any]


@dataclass(frozen=True)
class Relation:
    source: str
    target: str
    relation_type: str
    weight: int
    properties: dict[str, Any]


PEOPLE: list[Person] = [
    Person("hlm_001", "贾宝玉", "核心人物", "荣国府", 100, {"alias": "怡红公子", "risk": "核心"}),
    Person("hlm_002", "林黛玉", "核心人物", "林家", 96, {"alias": "潇湘妃子", "risk": "核心"}),
    Person("hlm_003", "薛宝钗", "核心人物", "薛家", 94, {"alias": "蘅芜君", "risk": "核心"}),
    Person("hlm_004", "王熙凤", "管家人物", "荣国府", 92, {"alias": "凤姐", "risk": "高影响"}),
    Person("hlm_005", "贾母", "家族长辈", "荣国府", 98, {"alias": "史太君", "risk": "核心"}),
    Person("hlm_006", "贾政", "家族长辈", "荣国府", 82, {"title": "工部员外郎"}),
    Person("hlm_007", "王夫人", "家族长辈", "荣国府", 84, {"family": "王家"}),
    Person("hlm_008", "贾琏", "家族成员", "荣国府", 78, {}),
    Person("hlm_009", "贾赦", "家族长辈", "荣国府", 74, {}),
    Person("hlm_010", "邢夫人", "家族长辈", "荣国府", 62, {}),
    Person("hlm_011", "贾珍", "家族成员", "宁国府", 76, {}),
    Person("hlm_012", "尤氏", "家族成员", "宁国府", 62, {}),
    Person("hlm_013", "贾蓉", "家族成员", "宁国府", 64, {}),
    Person("hlm_014", "秦可卿", "十二钗", "宁国府", 78, {}),
    Person("hlm_015", "贾敬", "家族长辈", "宁国府", 58, {}),
    Person("hlm_016", "贾元春", "十二钗", "皇宫", 88, {"title": "贤德妃"}),
    Person("hlm_017", "贾迎春", "十二钗", "荣国府", 68, {}),
    Person("hlm_018", "贾探春", "十二钗", "荣国府", 82, {}),
    Person("hlm_019", "贾惜春", "十二钗", "宁国府", 62, {}),
    Person("hlm_020", "李纨", "十二钗", "荣国府", 72, {}),
    Person("hlm_021", "贾兰", "家族成员", "荣国府", 54, {}),
    Person("hlm_022", "史湘云", "十二钗", "史家", 78, {}),
    Person("hlm_023", "妙玉", "十二钗", "栊翠庵", 66, {}),
    Person("hlm_024", "巧姐", "十二钗", "荣国府", 52, {}),
    Person("hlm_025", "薛蟠", "家族成员", "薛家", 68, {}),
    Person("hlm_026", "薛姨妈", "家族长辈", "薛家", 72, {}),
    Person("hlm_027", "香菱", "丫鬟侍妾", "薛家", 58, {}),
    Person("hlm_028", "夏金桂", "家族成员", "薛家", 48, {}),
    Person("hlm_029", "平儿", "丫鬟", "荣国府", 64, {}),
    Person("hlm_030", "袭人", "丫鬟", "怡红院", 74, {}),
    Person("hlm_031", "晴雯", "丫鬟", "怡红院", 72, {}),
    Person("hlm_032", "麝月", "丫鬟", "怡红院", 54, {}),
    Person("hlm_033", "紫鹃", "丫鬟", "潇湘馆", 64, {}),
    Person("hlm_034", "雪雁", "丫鬟", "潇湘馆", 42, {}),
    Person("hlm_035", "莺儿", "丫鬟", "蘅芜苑", 52, {}),
    Person("hlm_036", "鸳鸯", "丫鬟", "荣国府", 68, {}),
    Person("hlm_037", "司棋", "丫鬟", "荣国府", 44, {}),
    Person("hlm_038", "金钏", "丫鬟", "荣国府", 46, {}),
    Person("hlm_039", "玉钏", "丫鬟", "荣国府", 42, {}),
    Person("hlm_040", "茗烟", "小厮", "怡红院", 44, {}),
    Person("hlm_041", "刘姥姥", "外部人物", "刘家", 70, {}),
    Person("hlm_042", "板儿", "外部人物", "刘家", 38, {}),
    Person("hlm_043", "尤二姐", "外部人物", "尤家", 56, {}),
    Person("hlm_044", "尤三姐", "外部人物", "尤家", 54, {}),
    Person("hlm_045", "柳湘莲", "外部人物", "外部", 54, {}),
    Person("hlm_046", "北静王", "外部权贵", "王府", 58, {}),
    Person("hlm_047", "蒋玉菡", "外部人物", "外部", 46, {}),
    Person("hlm_048", "甄宝玉", "外部人物", "甄家", 42, {}),
    Person("hlm_049", "秦钟", "外部人物", "秦家", 50, {}),
    Person("hlm_050", "智能儿", "外部人物", "水月庵", 34, {}),
    Person("hlm_051", "贾雨村", "外部官员", "官场", 62, {}),
    Person("hlm_052", "甄士隐", "外部人物", "甄家", 50, {}),
    Person("hlm_053", "冷子兴", "外部人物", "外部", 38, {}),
    Person("hlm_054", "门子", "外部人物", "官场", 34, {}),
    Person("hlm_055", "贾芸", "家族旁支", "荣国府", 48, {}),
    Person("hlm_056", "小红", "丫鬟", "荣国府", 46, {}),
    Person("hlm_057", "贾环", "家族成员", "荣国府", 50, {}),
    Person("hlm_058", "赵姨娘", "家族成员", "荣国府", 52, {}),
    Person("hlm_059", "贾瑞", "家族旁支", "荣国府", 38, {}),
    Person("hlm_060", "贾代儒", "家族长辈", "荣国府", 36, {}),
]


RELATIONS: list[Relation] = [
    Relation("hlm_005", "hlm_001", "祖孙", 95, {"direction_note": "贾母为宝玉祖母"}),
    Relation("hlm_006", "hlm_001", "父子", 92, {}),
    Relation("hlm_007", "hlm_001", "母子", 92, {}),
    Relation("hlm_009", "hlm_008", "父子", 82, {}),
    Relation("hlm_010", "hlm_008", "继母子", 54, {}),
    Relation("hlm_008", "hlm_004", "夫妻", 88, {}),
    Relation("hlm_004", "hlm_024", "母女", 78, {}),
    Relation("hlm_008", "hlm_024", "父女", 72, {}),
    Relation("hlm_011", "hlm_013", "父子", 78, {}),
    Relation("hlm_012", "hlm_013", "母子", 58, {}),
    Relation("hlm_013", "hlm_014", "夫妻", 74, {}),
    Relation("hlm_015", "hlm_011", "父子", 60, {}),
    Relation("hlm_006", "hlm_016", "父女", 70, {}),
    Relation("hlm_007", "hlm_016", "母女", 72, {}),
    Relation("hlm_009", "hlm_017", "父女", 60, {}),
    Relation("hlm_006", "hlm_018", "父女", 70, {}),
    Relation("hlm_058", "hlm_018", "母女", 54, {}),
    Relation("hlm_011", "hlm_019", "兄妹", 48, {}),
    Relation("hlm_020", "hlm_021", "母子", 68, {}),
    Relation("hlm_001", "hlm_002", "知己", 100, {"evidence": "木石前盟"}),
    Relation("hlm_001", "hlm_003", "婚姻", 94, {"evidence": "金玉良缘"}),
    Relation("hlm_002", "hlm_003", "情感张力", 86, {}),
    Relation("hlm_001", "hlm_022", "表亲好友", 76, {}),
    Relation("hlm_001", "hlm_018", "兄妹知己", 72, {}),
    Relation("hlm_001", "hlm_017", "兄妹", 58, {}),
    Relation("hlm_001", "hlm_019", "兄妹", 54, {}),
    Relation("hlm_002", "hlm_033", "主仆", 86, {}),
    Relation("hlm_002", "hlm_034", "主仆", 50, {}),
    Relation("hlm_003", "hlm_035", "主仆", 68, {}),
    Relation("hlm_001", "hlm_030", "主仆", 88, {}),
    Relation("hlm_001", "hlm_031", "主仆", 84, {}),
    Relation("hlm_001", "hlm_032", "主仆", 58, {}),
    Relation("hlm_001", "hlm_040", "主仆", 54, {}),
    Relation("hlm_004", "hlm_029", "主仆亲信", 82, {}),
    Relation("hlm_005", "hlm_036", "主仆亲信", 80, {}),
    Relation("hlm_007", "hlm_038", "主仆", 48, {}),
    Relation("hlm_007", "hlm_039", "主仆", 44, {}),
    Relation("hlm_017", "hlm_037", "主仆", 44, {}),
    Relation("hlm_004", "hlm_005", "管家服务", 82, {}),
    Relation("hlm_004", "hlm_007", "家务管理", 78, {}),
    Relation("hlm_004", "hlm_020", "协同管理", 62, {}),
    Relation("hlm_004", "hlm_018", "协同管理", 64, {}),
    Relation("hlm_026", "hlm_003", "母女", 78, {}),
    Relation("hlm_026", "hlm_025", "母子", 76, {}),
    Relation("hlm_025", "hlm_027", "主仆侍妾", 66, {}),
    Relation("hlm_025", "hlm_028", "夫妻", 54, {}),
    Relation("hlm_028", "hlm_027", "冲突", 60, {}),
    Relation("hlm_004", "hlm_043", "冲突", 68, {}),
    Relation("hlm_008", "hlm_043", "婚姻纠葛", 72, {}),
    Relation("hlm_043", "hlm_044", "姐妹", 64, {}),
    Relation("hlm_044", "hlm_045", "情感", 60, {}),
    Relation("hlm_041", "hlm_005", "外部联系", 70, {}),
    Relation("hlm_041", "hlm_004", "外部联系", 64, {}),
    Relation("hlm_041", "hlm_024", "救助", 58, {}),
    Relation("hlm_041", "hlm_042", "祖孙", 54, {}),
    Relation("hlm_001", "hlm_046", "权贵交往", 56, {}),
    Relation("hlm_001", "hlm_047", "外部交往", 48, {}),
    Relation("hlm_001", "hlm_048", "镜像人物", 44, {}),
    Relation("hlm_001", "hlm_049", "好友", 58, {}),
    Relation("hlm_049", "hlm_050", "情感", 42, {}),
    Relation("hlm_051", "hlm_052", "恩义", 50, {}),
    Relation("hlm_051", "hlm_054", "官场旧识", 46, {}),
    Relation("hlm_051", "hlm_006", "官场关联", 44, {}),
    Relation("hlm_053", "hlm_006", "信息传播", 38, {}),
    Relation("hlm_055", "hlm_056", "情感", 50, {}),
    Relation("hlm_004", "hlm_056", "提拔", 46, {}),
    Relation("hlm_058", "hlm_057", "母子", 58, {}),
    Relation("hlm_006", "hlm_057", "父子", 54, {}),
    Relation("hlm_057", "hlm_001", "兄弟冲突", 54, {}),
    Relation("hlm_058", "hlm_007", "宅院冲突", 48, {}),
    Relation("hlm_059", "hlm_004", "纠葛", 42, {}),
    Relation("hlm_060", "hlm_059", "祖孙", 36, {}),
    Relation("hlm_023", "hlm_002", "诗社交往", 42, {}),
    Relation("hlm_023", "hlm_003", "诗社交往", 42, {}),
    Relation("hlm_022", "hlm_003", "诗社交往", 54, {}),
    Relation("hlm_018", "hlm_020", "诗社协同", 54, {}),
    Relation("hlm_017", "hlm_018", "姐妹", 58, {}),
    Relation("hlm_018", "hlm_019", "姐妹", 54, {}),
    Relation("hlm_016", "hlm_005", "祖孙", 64, {}),
    Relation("hlm_016", "hlm_001", "姐弟", 60, {}),
    Relation("hlm_022", "hlm_005", "亲族", 64, {}),
    Relation("hlm_003", "hlm_007", "姨甥", 58, {}),
    Relation("hlm_026", "hlm_007", "姐妹", 62, {}),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed PostgreSQL with Hongloumeng relationship graph data.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--database", default="postgres")
    parser.add_argument("--username", default=getpass.getuser())
    parser.add_argument("--password", default="")
    parser.add_argument("--schema", default="public")
    parser.add_argument("--node-table", default="nodes")
    parser.add_argument("--edge-table", default="edges")
    parser.add_argument("--replace", action="store_true", help="Delete all rows in target tables before inserting seed data.")
    return parser.parse_args()


def safe_name(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise ValueError(f"Unsafe SQL identifier: {value}")
    return f'"{value}"'


def build_url(args: argparse.Namespace) -> URL:
    return URL.create(
        "postgresql+psycopg",
        username=args.username,
        password=args.password or None,
        host=args.host,
        port=args.port,
        database=args.database,
    )


def seed(args: argparse.Namespace) -> None:
    schema = safe_name(args.schema)
    node_table = f"{schema}.{safe_name(args.node_table)}"
    edge_table = f"{schema}.{safe_name(args.edge_table)}"
    engine = create_engine(build_url(args), pool_pre_ping=True)

    with engine.begin() as conn:
        conn.execute(text(f"create schema if not exists {schema}"))
        conn.execute(
            text(
                f"""
                create table if not exists {node_table} (
                    id text primary key,
                    name text not null,
                    type text not null default '人物',
                    "group" text,
                    weight double precision not null default 1,
                    properties jsonb not null default '{{}}'::jsonb
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
                    properties jsonb not null default '{{}}'::jsonb
                )
                """
            )
        )

        if args.replace:
            conn.execute(text(f"delete from {edge_table}"))
            conn.execute(text(f"delete from {node_table}"))
        else:
            conn.execute(text(f"delete from {edge_table} where source like 'hlm_%' or target like 'hlm_%'"))
            conn.execute(text(f"delete from {node_table} where id like 'hlm_%'"))

        conn.execute(
            text(
                f"""
                insert into {node_table} (id, name, type, "group", weight, properties)
                values (:id, :name, :type, :group, :weight, cast(:properties as jsonb))
                on conflict (id) do update set
                    name = excluded.name,
                    type = excluded.type,
                    "group" = excluded."group",
                    weight = excluded.weight,
                    properties = excluded.properties
                """
            ),
            [
                {
                    "id": person.id,
                    "name": person.name,
                    "type": person.type,
                    "group": person.group,
                    "weight": person.weight,
                    "properties": json.dumps(person.properties, ensure_ascii=False),
                }
                for person in PEOPLE
            ],
        )

        conn.execute(
            text(
                f"""
                insert into {edge_table} (id, source, target, relation_type, weight, properties)
                values (:id, :source, :target, :relation_type, :weight, cast(:properties as jsonb))
                on conflict (id) do update set
                    source = excluded.source,
                    target = excluded.target,
                    relation_type = excluded.relation_type,
                    weight = excluded.weight,
                    properties = excluded.properties
                """
            ),
            [
                {
                    "id": f"hlm_e{index:03d}",
                    "source": relation.source,
                    "target": relation.target,
                    "relation_type": relation.relation_type,
                    "weight": relation.weight,
                    "properties": json.dumps(relation.properties, ensure_ascii=False),
                }
                for index, relation in enumerate(RELATIONS, start=1)
            ],
        )

    print(f"Seeded {len(PEOPLE)} nodes and {len(RELATIONS)} edges into {args.schema}.{args.node_table}/{args.edge_table}.")


if __name__ == "__main__":
    seed(parse_args())
