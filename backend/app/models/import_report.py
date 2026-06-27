from pydantic import BaseModel, Field


class ImportTopNode(BaseModel):
    id: str
    name: str
    type: str
    community_id: str
    degree: int
    importance_score: float


class ImportanceFormulaComponent(BaseModel):
    key: str
    label: str
    weight: float
    enabled: bool = True
    available: bool = True
    source: str = ""
    reason: str = ""
    scope: str | None = None
    field: str | None = None
    transform: str | None = None


class ImportanceAvailableField(BaseModel):
    key: str
    label: str
    scope: str
    field: str
    type: str = "number"
    coverage: float = 0.0
    transform: str = "minmax"
    reason: str = ""


class ImportanceFormula(BaseModel):
    detected_type: str = "social_default"
    label: str = "社交关系默认"
    confidence: float = 0.0
    components: list[ImportanceFormulaComponent] = Field(default_factory=list)


class ImportReport(BaseModel):
    nodes: int = 0
    edges: int = 0
    isolated_nodes: int = 0
    missing_endpoint_edges: int = 0
    missing_node_ids: list[str] = Field(default_factory=list)
    communities: int = 0
    top_communities: list[tuple[str, int]] = Field(default_factory=list)
    relation_types: list[tuple[str, int]] = Field(default_factory=list)
    top_nodes: list[ImportTopNode] = Field(default_factory=list)
    community_method: str = "label"
    importance_template: str = "auto"
    importance_template_label: str = "自动推荐"
    importance_template_status: str = "available"
    importance_formula: ImportanceFormula = Field(default_factory=ImportanceFormula)
    available_importance_fields: list[ImportanceAvailableField] = Field(default_factory=list)
    missing_required_fields: list[str] = Field(default_factory=list)
    missing_recommended_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DatabaseImportResponse(BaseModel):
    report: ImportReport
    committed: bool = False


class ImportPreviewJob(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    stage: str = "queued"
    stage_label: str = "等待处理"
    stage_index: int = 1
    stage_total: int = 5
    message: str = ""
    report: ImportReport | None = None
    error: str | None = None
