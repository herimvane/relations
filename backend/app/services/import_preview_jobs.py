from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from threading import Lock
from typing import Any

from app.models.graph import GraphData
from app.models.import_report import ImportPreviewJob, ImportReport
from app.services.csv_parser import parse_csv
from app.services.database_importer import analyze_graph
from app.services.excel_parser import parse_excel


@dataclass
class UploadPayload:
    filename: str
    content: bytes


@dataclass
class PreviewJobState:
    job_id: str
    status: str
    progress: int
    stage: str
    stage_label: str
    stage_index: int
    stage_total: int
    message: str
    community_method: str
    importance_template: str
    importance_formula: dict[str, Any] | None
    created_at: float
    updated_at: float
    file: UploadPayload | None = None
    nodes_file: UploadPayload | None = None
    edges_file: UploadPayload | None = None
    report: ImportReport | None = None
    error: str | None = None
    cancelled: bool = False


class ImportPreviewJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, PreviewJobState] = {}
        self._lock = Lock()

    def create(
        self,
        *,
        community_method: str,
        importance_template: str,
        importance_formula: dict[str, Any] | None,
        file: UploadPayload | None,
        nodes_file: UploadPayload | None,
        edges_file: UploadPayload | None,
    ) -> ImportPreviewJob:
        job_id = uuid.uuid4().hex
        now = time.time()
        state = PreviewJobState(
            job_id=job_id,
            status="queued",
            progress=5,
            stage="queued",
            stage_label="等待处理",
            stage_index=1,
            stage_total=5,
            message="任务已创建，等待解析文件...",
            community_method=community_method,
            importance_template=importance_template,
            importance_formula=importance_formula,
            created_at=now,
            updated_at=now,
            file=file,
            nodes_file=nodes_file,
            edges_file=edges_file,
        )
        with self._lock:
            self._jobs[job_id] = state
        return self.snapshot(job_id)

    def snapshot(self, job_id: str) -> ImportPreviewJob:
        with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                raise KeyError(job_id)
            return ImportPreviewJob(
                job_id=state.job_id,
                status=state.status,
                progress=state.progress,
                stage=state.stage,
                stage_label=state.stage_label,
                stage_index=state.stage_index,
                stage_total=state.stage_total,
                message=state.message,
                report=state.report,
                error=state.error,
            )

    def cancel(self, job_id: str) -> ImportPreviewJob:
        with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                raise KeyError(job_id)
            if state.status in {"completed", "failed", "cancelled"}:
                pass
            else:
                state.cancelled = True
                state.status = "cancelled"
                state.progress = min(state.progress, 99)
                state.stage = "cancelled"
                state.stage_label = "已取消"
                state.message = "任务已取消。"
                state.updated_at = time.time()
            return ImportPreviewJob(
                job_id=state.job_id,
                status=state.status,
                progress=state.progress,
                stage=state.stage,
                stage_label=state.stage_label,
                stage_index=state.stage_index,
                stage_total=state.stage_total,
                message=state.message,
                report=state.report,
                error=state.error,
            )

    def update(self, job_id: str, **changes: object) -> bool:
        with self._lock:
            state = self._jobs.get(job_id)
            if not state or state.cancelled:
                return False
            for key, value in changes.items():
                setattr(state, key, value)
            state.updated_at = time.time()
            return True

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            state = self._jobs.get(job_id)
            return bool(state and state.cancelled)

    def payload(self, job_id: str) -> PreviewJobState:
        with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                raise KeyError(job_id)
            return state


preview_job_store = ImportPreviewJobStore()


def _parse_graph_from_payload(state: PreviewJobState) -> GraphData:
    if state.file:
        filename = state.file.filename.lower()
        if filename.endswith((".xlsx", ".xls")):
            return parse_excel(state.file.content)
        if filename.endswith(".csv"):
            return parse_csv(None, state.file.content)
        raise ValueError("Only Excel (.xlsx/.xls) or CSV files are supported")

    nodes_content = state.nodes_file.content if state.nodes_file else None
    edges_content = state.edges_file.content if state.edges_file else None
    if not nodes_content and not edges_content:
        raise ValueError("Please upload an Excel file or at least one CSV file")
    return parse_csv(nodes_content, edges_content)


def _run_preview_job_sync(job_id: str) -> None:
    state = preview_job_store.payload(job_id)
    if preview_job_store.is_cancelled(job_id):
        return
    preview_job_store.update(
        job_id,
        status="running",
        progress=20,
        stage="parsing",
        stage_label="解析文件",
        stage_index=2,
        message="正在解析上传文件...",
    )
    graph = _parse_graph_from_payload(state)
    if preview_job_store.is_cancelled(job_id):
        return
    preview_job_store.update(
        job_id,
        progress=40,
        stage="validating",
        stage_label="校验结构",
        stage_index=3,
        message=f"正在校验节点与关系：{len(graph.nodes):,} 节点 / {len(graph.edges):,} 关系...",
    )
    if preview_job_store.is_cancelled(job_id):
        return
    preview_job_store.update(
        job_id,
        progress=65,
        stage="analyzing",
        stage_label="计算社区与重要度",
        stage_index=4,
        message=f"正在识别社区、计算重要度和字段覆盖率：{len(graph.nodes):,} 节点 / {len(graph.edges):,} 关系...",
    )
    _, report = analyze_graph(graph, state.community_method, state.importance_template, state.importance_formula)
    if preview_job_store.is_cancelled(job_id):
        return
    preview_job_store.update(
        job_id,
        status="completed",
        progress=100,
        stage="completed",
        stage_label="完成",
        stage_index=5,
        message="校验报告已生成。",
        report=report,
    )


async def run_preview_job(job_id: str) -> None:
    try:
        await asyncio.to_thread(_run_preview_job_sync, job_id)
    except Exception as exc:
        preview_job_store.update(
            job_id,
            status="failed",
            progress=100,
            stage="failed",
            stage_label="失败",
            message="校验报告生成失败。",
            error=str(exc),
        )
