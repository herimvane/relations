import { GraphPath, NodeSearchResult } from '../types/graph';

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

export async function searchDatabaseNodes(query: string, limit = 20): Promise<NodeSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${API_BASE}/api/search/nodes?${params.toString()}`);
  if (!response.ok) throw await apiError(response, 'Node search API failed');
  const body = await response.json();
  return body.results ?? [];
}

export async function searchDatabasePaths(source: string, target: string, maxDepth = 4, maxPaths = 8): Promise<GraphPath[]> {
  const params = new URLSearchParams({
    source,
    target,
    max_depth: String(maxDepth),
    max_paths: String(maxPaths)
  });
  const response = await fetch(`${API_BASE}/api/search/path?${params.toString()}`);
  if (!response.ok) throw await apiError(response, 'Path search API failed');
  const body = await response.json();
  return body.paths ?? [];
}
