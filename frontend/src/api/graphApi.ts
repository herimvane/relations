import { CommunityMethod, DatabaseImportResponse, GraphData, GraphViewResponse, ImportanceFormula, ImportanceTemplate, ImportPreviewJob } from '../types/graph';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function apiError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    const detail = typeof body?.detail === 'string' ? body.detail : undefined;
    return new Error(detail ? `${fallback}: ${detail}` : `${fallback}: ${response.status}`);
  } catch {
    return new Error(`${fallback}: ${response.status}`);
  }
}

export async function fetchGraph(): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/graph`);
  if (!response.ok) throw await apiError(response, 'Graph API failed');
  return response.json();
}

export async function uploadExcel(file: File): Promise<GraphData> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}/api/import/excel`, { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, 'Excel import failed');
  return response.json();
}

export async function uploadCsv(nodesFile?: File, edgesFile?: File): Promise<GraphData> {
  const form = new FormData();
  if (nodesFile) form.append('nodes_file', nodesFile);
  if (edgesFile) form.append('edges_file', edgesFile);
  const response = await fetch(`${API_BASE}/api/import/csv`, { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, 'CSV import failed');
  return response.json();
}

function appendImportFiles(form: FormData, files: File[]) {
  const excelFile = files.find((file) => /\.(xlsx|xls)$/i.test(file.name));
  if (excelFile) {
    form.append('file', excelFile);
    return;
  }

  const csvFiles = files.filter((file) => /\.csv$/i.test(file.name));
  const nodesFile = csvFiles.find((file) => /node|节点/i.test(file.name));
  const edgesFile = csvFiles.find((file) => /edge|relation|关系|边/i.test(file.name));

  if (nodesFile) form.append('nodes_file', nodesFile);
  if (edgesFile) form.append('edges_file', edgesFile);
  if (!nodesFile && !edgesFile && csvFiles[0]) form.append('file', csvFiles[0]);
}

function appendImportanceFormula(form: FormData, importanceFormula?: ImportanceFormula) {
  if (!importanceFormula?.components?.length) return;
  form.append('importance_formula', JSON.stringify(importanceFormula));
}

async function submitDatabaseImport(
  path: 'preview' | 'commit',
  files: File[],
  communityMethod: CommunityMethod,
  importanceTemplate: ImportanceTemplate,
  importanceFormula?: ImportanceFormula,
): Promise<DatabaseImportResponse> {
  const form = new FormData();
  appendImportFiles(form, files);
  form.append('community_method', communityMethod);
  form.append('importance_template', importanceTemplate);
  appendImportanceFormula(form, importanceFormula);
  const response = await fetch(`${API_BASE}/api/import/database/${path}`, { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, path === 'preview' ? 'Import preview failed' : 'Database import failed');
  return response.json();
}

export async function previewDatabaseImport(
  files: File[],
  communityMethod: CommunityMethod,
  importanceTemplate: ImportanceTemplate,
  importanceFormula?: ImportanceFormula,
): Promise<DatabaseImportResponse> {
  return submitDatabaseImport('preview', files, communityMethod, importanceTemplate, importanceFormula);
}

export async function createDatabasePreviewJob(
  files: File[],
  communityMethod: CommunityMethod,
  importanceTemplate: ImportanceTemplate,
  importanceFormula?: ImportanceFormula,
): Promise<ImportPreviewJob> {
  const form = new FormData();
  appendImportFiles(form, files);
  form.append('community_method', communityMethod);
  form.append('importance_template', importanceTemplate);
  appendImportanceFormula(form, importanceFormula);
  const response = await fetch(`${API_BASE}/api/import/database/preview-jobs`, { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, 'Import preview job failed');
  return response.json();
}

export async function fetchDatabasePreviewJob(jobId: string): Promise<ImportPreviewJob> {
  const response = await fetch(`${API_BASE}/api/import/database/preview-jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw await apiError(response, 'Import preview job status failed');
  return response.json();
}

export async function cancelDatabasePreviewJob(jobId: string): Promise<ImportPreviewJob> {
  const response = await fetch(`${API_BASE}/api/import/database/preview-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'Import preview cancel failed');
  return response.json();
}

export async function commitDatabaseImport(
  files: File[],
  communityMethod: CommunityMethod,
  importanceTemplate: ImportanceTemplate,
  importanceFormula?: ImportanceFormula,
): Promise<DatabaseImportResponse> {
  return submitDatabaseImport('commit', files, communityMethod, importanceTemplate, importanceFormula);
}

export async function fetchUniverseView(): Promise<GraphViewResponse> {
  const response = await fetch(`${API_BASE}/api/views/universe`);
  if (!response.ok) throw await apiError(response, 'Universe view API failed');
  return response.json();
}

export async function fetchGalaxyView(communityId: string): Promise<GraphViewResponse> {
  const response = await fetch(`${API_BASE}/api/views/galaxy/${encodeURIComponent(communityId)}`);
  if (!response.ok) throw await apiError(response, 'Galaxy view API failed');
  return response.json();
}

export async function fetchBackboneView(nodeId: string): Promise<GraphViewResponse> {
  const response = await fetch(`${API_BASE}/api/views/backbone/${encodeURIComponent(nodeId)}`);
  if (!response.ok) throw await apiError(response, 'Backbone view API failed');
  return response.json();
}

export async function fetchLocalView(nodeId: string): Promise<GraphViewResponse> {
  const response = await fetch(`${API_BASE}/api/views/local/${encodeURIComponent(nodeId)}`);
  if (!response.ok) throw await apiError(response, 'Local view API failed');
  return response.json();
}
