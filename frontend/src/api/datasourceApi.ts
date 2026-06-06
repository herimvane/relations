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

export type PostgresConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
};

export type PostgresGraphRequest = {
  config: PostgresConfig;
  node_table: string;
  edge_table: string;
  node_mapping: Record<string, string>;
  edge_mapping: Record<string, string>;
};

export async function testPostgres(config: PostgresConfig) {
  const response = await fetch(`${API_BASE}/api/datasources/postgres/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!response.ok) throw await apiError(response, 'PostgreSQL test failed');
  return response.json();
}

export async function loadPostgresGraph(payload: PostgresGraphRequest): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/datasources/postgres/graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw await apiError(response, 'PostgreSQL graph failed');
  return response.json();
}
