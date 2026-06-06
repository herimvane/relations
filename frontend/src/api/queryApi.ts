import { GraphData } from '../types/graph';

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

export async function queryPath(source: string, target: string, maxDepth = 4, maxPaths = 12): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/graph/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, target, max_depth: maxDepth, max_paths: maxPaths })
  });
  if (!response.ok) throw await apiError(response, 'Path query failed');
  return response.json();
}

export async function extractTableGraph(payload: {
  rows: Record<string, unknown>[];
  source_field: string;
  target_field: string;
  relation_field?: string;
  weight_field?: string;
}): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/graph/extract-table`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw await apiError(response, 'Table extraction failed');
  return response.json();
}
