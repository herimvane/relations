from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.models.graph import GraphEdge, GraphNode


@dataclass(frozen=True)
class ImportanceTemplate:
    name: str
    label: str
    description: str
    required_fields: tuple[str, ...]
    recommended_fields: tuple[str, ...]
    optional_fields: tuple[str, ...] = ()


TEMPLATES = {
    "auto": ImportanceTemplate(
        name="auto",
        label="通用结构重要度",
        description="默认以连接数量为主，兼顾关系强度和节点自身权重。",
        required_fields=(),
        recommended_fields=("edge.weight", "node.weight"),
    ),
    "social_default": ImportanceTemplate(
        name="social_default",
        label="社交关系默认",
        description="以连接数量为主，兼顾关系强度和节点自身权重。",
        required_fields=(),
        recommended_fields=("edge.weight", "node.weight"),
    ),
    "enterprise_risk": ImportanceTemplate(
        name="enterprise_risk",
        label="企业风控",
        description="在结构重要度基础上增强风险等级、风险分和关键关系类型。",
        required_fields=(),
        recommended_fields=("node.properties.risk_score", "node.properties.risk_level", "edge.relation_type", "edge.weight"),
        optional_fields=("node.properties.industry", "node.properties.region"),
    ),
    "transaction_monitoring": ImportanceTemplate(
        name="transaction_monitoring",
        label="资金交易",
        description="突出交易金额、交易频次、交易对手数量和结构中心度。",
        required_fields=(),
        recommended_fields=("edge.properties.amount", "edge.properties.transaction_count", "edge.weight"),
        optional_fields=("edge.properties.transaction_time",),
    ),
    "ownership_control": ImportanceTemplate(
        name="ownership_control",
        label="股权控制",
        description="突出持股比例、控制/投资关系和关系网络中的控制影响力。",
        required_fields=(),
        recommended_fields=("edge.properties.shareholding_ratio", "edge.relation_type", "edge.weight"),
        optional_fields=("node.properties.level", "node.properties.registered_capital"),
    ),
}

COMPONENTS = {
    "degree": {"label": "连接数量", "source": "graph.degree", "reason": "节点直接连接越多，结构影响力通常越高。"},
    "strength": {"label": "关系强度", "source": "edge.weight", "reason": "累计边权重越高，关系强度越高。"},
    "business_weight": {"label": "业务权重", "source": "node.weight", "reason": "保留导入数据中已有的业务权重。"},
}

DEFAULT_FORMULA_COMPONENTS = [
    {"key": "degree", "label": "连接数量", "weight": 0.72, "enabled": True, "available": True, "source": "graph.degree", "reason": COMPONENTS["degree"]["reason"]},
    {"key": "strength", "label": "关系强度", "weight": 0.16, "enabled": True, "available": True, "source": "edge.weight", "reason": COMPONENTS["strength"]["reason"]},
    {"key": "business_weight", "label": "业务权重", "weight": 0.12, "enabled": True, "available": True, "source": "node.weight", "reason": COMPONENTS["business_weight"]["reason"]},
]


def template_names() -> set[str]:
    return set(TEMPLATES)


def resolve_template(name: str) -> ImportanceTemplate:
    return TEMPLATES.get(name) or TEMPLATES["auto"]


def _props(item: GraphNode | GraphEdge) -> dict[str, Any]:
    return item.properties or {}


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace("%", "")
        if not cleaned:
            return default
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default


def _category_score(value: Any, mapping: dict[str, float], default: float = 0.0) -> float:
    normalized = str(value or "").strip().lower()
    return mapping.get(normalized, default)


def _field_exists(field: str, nodes: list[GraphNode], edges: list[GraphEdge]) -> bool:
    if field == "node.weight":
        return any(node.weight is not None for node in nodes)
    if field == "edge.weight":
        return any(edge.weight is not None for edge in edges)
    if field == "edge.relation_type":
        return any(bool(edge.relation_type) for edge in edges)
    if field.startswith("node.properties."):
        key = field.removeprefix("node.properties.")
        return any(key in _props(node) and _props(node).get(key) not in (None, "") for node in nodes)
    if field.startswith("edge.properties."):
        key = field.removeprefix("edge.properties.")
        return any(key in _props(edge) and _props(edge).get(key) not in (None, "") for edge in edges)
    return False


def inspect_template_fields(template_name: str, nodes: list[GraphNode], edges: list[GraphEdge]) -> dict[str, Any]:
    template = resolve_template(template_name)
    required_missing = [field for field in template.required_fields if not _field_exists(field, nodes, edges)]
    recommended_missing = [field for field in template.recommended_fields if not _field_exists(field, nodes, edges)]
    optional_missing = [field for field in template.optional_fields if not _field_exists(field, nodes, edges)]
    status = "available"
    if required_missing:
        status = "unavailable"
    elif recommended_missing:
        status = "degraded"
    return {
        "name": template.name,
        "label": template.label,
        "status": status,
        "required_missing": required_missing,
        "recommended_missing": recommended_missing,
        "optional_missing": optional_missing,
        "description": template.description,
    }


def _max(values: dict[str, float] | dict[str, int]) -> float:
    return max((float(value) for value in values.values()), default=1.0) or 1.0


def _log_score(value: float, max_value: float) -> float:
    return math.log1p(max(0.0, value)) / math.log1p(max(1.0, max_value))


def _sqrt_score(value: float, max_value: float) -> float:
    return math.sqrt(max(0.0, value) / max(1.0, max_value))


def _is_numeric_like(value: Any) -> bool:
    if value in (None, ""):
        return False
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        return _to_float(value, math.nan) == _to_float(value, math.nan)
    return False


def _field_transform(values: list[float]) -> str:
    positive = [value for value in values if value > 0]
    if not positive:
        return "minmax"
    maximum = max(positive)
    minimum = min(positive)
    if maximum >= 1000 or maximum / max(1e-9, minimum) >= 100:
        return "log"
    return "minmax"


def discover_importance_fields(nodes: list[GraphNode], edges: list[GraphEdge]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []

    def collect(items: list[GraphNode] | list[GraphEdge], scope: str) -> None:
        total = max(1, len(items))
        values_by_field: dict[str, list[float]] = defaultdict(list)
        for item in items:
            for key, value in _props(item).items():
                if _is_numeric_like(value):
                    values_by_field[str(key)].append(_to_float(value))
        for field, values in values_by_field.items():
            coverage = len(values) / total
            if coverage < 0.05:
                continue
            source = f"{scope}.properties.{field}"
            fields.append({
                "key": source,
                "label": field,
                "scope": scope,
                "field": field,
                "type": "number",
                "coverage": round(coverage, 4),
                "transform": _field_transform(values),
                "reason": f"{field} 覆盖率 {(coverage * 100):.0f}%，可作为自定义重要度因子。",
            })

    collect(nodes, "node")
    collect(edges, "edge")
    return sorted(fields, key=lambda item: (item["scope"], -item["coverage"], item["label"]))[:80]


def recommend_importance_formula(
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    template_name: str = "auto",
) -> dict[str, Any]:
    template = resolve_template(template_name)
    return {
        "detected_type": "structural_default",
        "label": template.label,
        "confidence": 1.0,
        "components": _normalize_formula_components({"components": DEFAULT_FORMULA_COMPONENTS})["components"],
    }


def _normalize_formula_components(formula: dict[str, Any] | None) -> dict[str, Any]:
    raw_components = formula.get("components") if isinstance(formula, dict) else None
    components: list[dict[str, Any]] = []
    if not isinstance(raw_components, list):
        return {"components": []}

    for raw in raw_components:
        if not isinstance(raw, dict):
            continue
        key = str(raw.get("key") or "")
        source = str(raw.get("source") or "")
        is_field_component = key.startswith("field:") and (
            source.startswith("node.properties.") or source.startswith("edge.properties.")
        )
        if key not in COMPONENTS and not is_field_component:
            continue
        spec = COMPONENTS.get(key, {})
        available = bool(raw.get("available", True))
        enabled = bool(raw.get("enabled", True)) and available
        weight = max(0.0, _to_float(raw.get("weight"), 0.0))
        components.append({
            "key": key,
            "label": str(raw.get("label") or spec.get("label") or source),
            "weight": weight,
            "enabled": enabled,
            "available": available,
            "source": source or str(spec.get("source") or ""),
            "reason": str(raw.get("reason") or spec.get("reason") or "用户添加的属性字段。"),
            "scope": raw.get("scope"),
            "field": raw.get("field"),
            "transform": raw.get("transform") or "minmax",
        })

    total = sum(component["weight"] for component in components if component["enabled"] and component["available"])
    if total <= 0:
        return {"components": [dict(component) for component in DEFAULT_FORMULA_COMPONENTS]}
    else:
        for component in components:
            if component["enabled"] and component["available"]:
                component["weight"] = component["weight"] / total
            else:
                component["weight"] = 0.0

    for component in components:
        component["weight"] = round(float(component["weight"]), 4)
    return {"components": components}


def _custom_field_scores(
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    components: list[dict[str, Any]],
) -> dict[str, dict[str, float]]:
    scores_by_component: dict[str, dict[str, float]] = {}
    for component in components:
        source = str(component.get("source") or "")
        if not component["key"].startswith("field:"):
            continue
        values: dict[str, float] = defaultdict(float)
        if source.startswith("node.properties."):
            field = source.removeprefix("node.properties.")
            for node in nodes:
                values[node.id] = _to_float(_props(node).get(field))
        elif source.startswith("edge.properties."):
            field = source.removeprefix("edge.properties.")
            for edge in edges:
                value = _to_float(_props(edge).get(field))
                values[edge.source] += value
                values[edge.target] += value
        else:
            continue

        max_value = _max(values)
        transform = str(component.get("transform") or "minmax")
        if transform == "log":
            scores_by_component[component["key"]] = {node_id: _log_score(value, max_value) for node_id, value in values.items()}
        elif transform == "sqrt":
            scores_by_component[component["key"]] = {node_id: _sqrt_score(value, max_value) for node_id, value in values.items()}
        else:
            scores_by_component[component["key"]] = {
                node_id: max(0.0, min(1.0, value / max(1.0, max_value)))
                for node_id, value in values.items()
            }
    return scores_by_component


def _formula_with_metadata(recommended: dict[str, Any], formula: dict[str, Any] | None) -> dict[str, Any]:
    if formula:
        normalized = _normalize_formula_components(formula)
        if normalized["components"]:
            return {
                "detected_type": str(formula.get("detected_type") or recommended["detected_type"]),
                "label": str(formula.get("label") or recommended["label"]),
                "confidence": float(formula.get("confidence") or recommended["confidence"]),
                "components": normalized["components"],
            }
    return recommended


def calculate_node_importance(
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    degree: dict[str, int],
    strength: dict[str, float],
    template_name: str = "auto",
    formula: dict[str, Any] | None = None,
) -> tuple[dict[str, float], dict[str, Any]]:
    recommended = recommend_importance_formula(nodes, edges, template_name)
    active_formula = _formula_with_metadata(recommended, formula)
    field_report = inspect_template_fields(active_formula["detected_type"], nodes, edges)
    field_report["name"] = "auto"
    field_report["label"] = active_formula["label"]
    field_report["formula"] = active_formula
    field_report["available_fields"] = discover_importance_fields(nodes, edges)

    max_degree = _max(degree)
    max_strength = _max(strength)
    max_weight = max((float(node.weight or 1) for node in nodes), default=1.0) or 1.0

    custom_scores = _custom_field_scores(nodes, edges, active_formula["components"])

    result: dict[str, float] = {}
    for node in nodes:
        component_scores = {
            "degree": _log_score(float(degree[node.id]), max_degree),
            "strength": _log_score(float(strength[node.id]), max_strength),
            "business_weight": _sqrt_score(float(node.weight or 1), max_weight),
        }

        importance = 0.0
        for component in active_formula["components"]:
            key = component["key"]
            if not component.get("enabled", True) or not component.get("available", True):
                continue
            score = custom_scores.get(key, {}).get(node.id, 0.0) if key.startswith("field:") else component_scores.get(key, 0.0)
            importance += float(component["weight"]) * score
        result[node.id] = round(max(0.0, min(1.0, importance)), 6)

    return result, field_report
