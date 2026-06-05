from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.graph import GraphData
from app.services.csv_parser import parse_csv
from app.services.excel_parser import parse_excel
from app.services.graph_store import graph_store

router = APIRouter(prefix="/api/import", tags=["import"])


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
