import { GraphData } from '../types/graph';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function queryPath(source: string, target: string, maxDepth = 4): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/graph/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, target, max_depth: maxDepth })
  });
  if (!response.ok) throw new Error(`Path query failed: ${response.status}`);
  return response.json();
}
