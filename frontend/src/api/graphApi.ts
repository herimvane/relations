import { GraphData, GraphViewResponse } from '../types/graph';

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
