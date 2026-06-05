import { GraphData } from '../types/graph';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

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
  if (!response.ok) throw new Error(`PostgreSQL test failed: ${response.status}`);
  return response.json();
}

export async function loadPostgresGraph(payload: PostgresGraphRequest): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/api/datasources/postgres/graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`PostgreSQL graph failed: ${response.status}`);
  return response.json();
}
