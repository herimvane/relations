import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.graph import GraphData
from app.models.import_report import DatabaseImportResponse, ImportPreviewJob
from app.services.csv_parser import parse_csv
from app.services.database_importer import analyze_graph, write_database
from app.services.excel_parser import parse_excel
from app.services.graph_store import graph_store
from app.services.importance import template_names
from app.services.import_preview_jobs import UploadPayload, preview_job_store, run_preview_job

router = APIRouter(prefix="/api/import", tags=["import"])
COMMUNITY_METHODS = {"label", "louvain", "leiden", "connected", "existing"}
IMPORTANCE_TEMPLATES = template_names()


@router.post("/excel", response_model=GraphData)
async def import_excel(file: UploadFile = File(...)) -> GraphData:
    try:
        graph = parse_excel(await file.read())
        return graph_store.set(graph)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/csv", response_model=GraphData)
async def import_csv(nodes_file: UploadFile | None = File(None), edges_file: UploadFile | None = File(None)) -> GraphData:
    try:
        graph = parse_csv(await nodes_file.read() if nodes_file else None, await edges_file.read() if edges_file else None)
        return graph_store.set(graph)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _parse_uploaded_graph(
    file: UploadFile | None,
    nodes_file: UploadFile | None,
    edges_file: UploadFile | None,
) -> GraphData:
    if file:
        filename = (file.filename or "").lower()
        content = await file.read()
        if filename.endswith((".xlsx", ".xls")):
            return parse_excel(content)
        if filename.endswith(".csv"):
            return parse_csv(None, content)
        raise ValueError("Only Excel (.xlsx/.xls) or CSV files are supported")

    nodes_content = await nodes_file.read() if nodes_file else None
    edges_content = await edges_file.read() if edges_file else None
    if not nodes_content and not edges_content:
        raise ValueError("Please upload an Excel file or at least one CSV file")
    return parse_csv(nodes_content, edges_content)


def _normalize_method(community_method: str) -> str:
    method = community_method.strip().lower()
    if method not in COMMUNITY_METHODS:
        raise ValueError("community_method must be one of: label, louvain, leiden, connected, existing")
    return method


def _normalize_importance_template(importance_template: str) -> str:
    template = importance_template.strip().lower()
    if template not in IMPORTANCE_TEMPLATES:
        raise ValueError(f"importance_template must be one of: {', '.join(sorted(IMPORTANCE_TEMPLATES))}")
    return template


def _parse_importance_formula(importance_formula: str | None) -> dict | None:
    if not importance_formula:
        return None
    try:
        parsed = json.loads(importance_formula)
    except json.JSONDecodeError as exc:
        raise ValueError("importance_formula must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("importance_formula must be a JSON object")
    return parsed


@router.post("/database/preview", response_model=DatabaseImportResponse)
async def preview_database_import(
    file: UploadFile | None = File(None),
    nodes_file: UploadFile | None = File(None),
    edges_file: UploadFile | None = File(None),
    community_method: str = Form("label"),
    importance_template: str = Form("auto"),
    importance_formula: str | None = Form(None),
) -> DatabaseImportResponse:
    try:
        method = _normalize_method(community_method)
        template = _normalize_importance_template(importance_template)
        formula = _parse_importance_formula(importance_formula)
        graph = await _parse_uploaded_graph(file, nodes_file, edges_file)
        _, report = analyze_graph(graph, method, template, formula)
        return DatabaseImportResponse(report=report, committed=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _payload(upload: UploadFile | None) -> UploadPayload | None:
    if not upload:
        return None
    return UploadPayload(filename=upload.filename or "upload", content=await upload.read())


@router.post("/database/preview-jobs", response_model=ImportPreviewJob)
async def create_database_preview_job(
    file: UploadFile | None = File(None),
    nodes_file: UploadFile | None = File(None),
    edges_file: UploadFile | None = File(None),
    community_method: str = Form("label"),
    importance_template: str = Form("auto"),
    importance_formula: str | None = Form(None),
) -> ImportPreviewJob:
    try:
        method = _normalize_method(community_method)
        template = _normalize_importance_template(importance_template)
        formula = _parse_importance_formula(importance_formula)
        if not file and not nodes_file and not edges_file:
            raise ValueError("Please upload an Excel file or at least one CSV file")
        job = preview_job_store.create(
            community_method=method,
            importance_template=template,
            importance_formula=formula,
            file=await _payload(file),
            nodes_file=await _payload(nodes_file),
            edges_file=await _payload(edges_file),
        )
        asyncio.create_task(run_preview_job(job.job_id))
        return job
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/database/preview-jobs/{job_id}", response_model=ImportPreviewJob)
async def get_database_preview_job(job_id: str) -> ImportPreviewJob:
    try:
        return preview_job_store.snapshot(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Preview job not found") from exc


@router.delete("/database/preview-jobs/{job_id}", response_model=ImportPreviewJob)
async def cancel_database_preview_job(job_id: str) -> ImportPreviewJob:
    try:
        return preview_job_store.cancel(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Preview job not found") from exc


@router.post("/database/commit", response_model=DatabaseImportResponse)
async def commit_database_import(
    file: UploadFile | None = File(None),
    nodes_file: UploadFile | None = File(None),
    edges_file: UploadFile | None = File(None),
    community_method: str = Form("label"),
    importance_template: str = Form("auto"),
    importance_formula: str | None = Form(None),
) -> DatabaseImportResponse:
    try:
        method = _normalize_method(community_method)
        template = _normalize_importance_template(importance_template)
        formula = _parse_importance_formula(importance_formula)
        graph = await _parse_uploaded_graph(file, nodes_file, edges_file)
        analyzed_graph, report = analyze_graph(graph, method, template, formula)
        write_database(analyzed_graph)
        return DatabaseImportResponse(report=report, committed=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
