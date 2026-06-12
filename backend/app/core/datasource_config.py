from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class DatasetConfig:
    database: str
    title: str


@dataclass(frozen=True)
class PostgresRuntimeConfig:
    host: str = "127.0.0.1"
    port: int = 5432
    username: str = "herimvane"
    password: str = ""
    schema: str = "public"
    node_table: str = "nodes"
    edge_table: str = "edges"


DEFAULT_DATASETS = {
    "social": DatasetConfig(database="relations", title="社交关系大图"),
    "enterprise": DatasetConfig(database="relations2", title="企业/风控关系图"),
}


def _config_path() -> Path:
    configured = os.getenv("NEBULANET_DATASOURCES_CONFIG")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / "datasources.json"


def _load_json() -> dict[str, Any]:
    path = _config_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def postgres_config() -> PostgresRuntimeConfig:
    data = _load_json().get("postgres", {})
    return PostgresRuntimeConfig(
        host=str(data.get("host", "127.0.0.1")),
        port=int(data.get("port", 5432)),
        username=str(data.get("username", "herimvane")),
        password=str(data.get("password", "")),
        schema=str(data.get("schema", "public")),
        node_table=str(data.get("node_table", "nodes")),
        edge_table=str(data.get("edge_table", "edges")),
    )


def active_dataset() -> str:
    return str(_load_json().get("active_dataset", "social"))


def dataset_config(dataset: str) -> DatasetConfig:
    datasets = dict(DEFAULT_DATASETS)
    for key, value in _load_json().get("datasets", {}).items():
        datasets[key] = DatasetConfig(database=str(value["database"]), title=str(value.get("title", key)))
    if dataset not in datasets:
        raise ValueError(f"Unknown dataset: {dataset}")
    return datasets[dataset]
