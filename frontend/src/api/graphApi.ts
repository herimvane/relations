import { GraphData } from '../types/graph';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function fetchGraph(): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/graph`);
  if (!response.ok) throw new Error(`Graph API failed: ${response.status}`);
  return response.json();
}

export async function uploadExcel(file: File): Promise<GraphData> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}/api/import/excel`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Excel import failed: ${response.status}`);
  return response.json();
}

export async function uploadCsv(nodesFile?: File, edgesFile?: File): Promise<GraphData> {
  const form = new FormData();
  if (nodesFile) form.append('nodes_file', nodesFile);
  if (edgesFile) form.append('edges_file', edgesFile);
  const response = await fetch(`${API_BASE}/api/import/csv`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`CSV import failed: ${response.status}`);
  return response.json();
}
