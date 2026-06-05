import { useState } from 'react';
import { Database, FileSpreadsheet, PlugZap } from 'lucide-react';
import { loadPostgresGraph, PostgresConfig, testPostgres } from '../api/datasourceApi';
import { GraphData } from '../types/graph';

type Props = {
  source: string;
  error?: string;
  onLoadGraph: (graph: GraphData, source: string) => void;
  onError: (message?: string) => void;
};

const defaultConfig: PostgresConfig = {
  host: '127.0.0.1',
  port: 5432,
  database: '',
  username: '',
  password: '',
  schema: 'public'
};

export function DataSourcePanel({ source, error, onLoadGraph, onError }: Props) {
  const [config, setConfig] = useState<PostgresConfig>(defaultConfig);
  const [nodeTable, setNodeTable] = useState('nodes');
  const [edgeTable, setEdgeTable] = useState('edges');
  const [nodeMapping, setNodeMapping] = useState('{"id":"id","name":"name","type":"type","group":"group","weight":"weight"}');
  const [edgeMapping, setEdgeMapping] = useState('{"source":"source","target":"target","relation_type":"relation_type","weight":"weight"}');
  const [busy, setBusy] = useState(false);

  const updateConfig = (key: keyof PostgresConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: key === 'port' ? Number(value) : value }));
  };

  const runTest = async () => {
    setBusy(true);
    try {
      await testPostgres(config);
      onError(undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'PostgreSQL connection failed');
    } finally {
      setBusy(false);
    }
  };

  const runLoad = async () => {
    setBusy(true);
    try {
      const graph = await loadPostgresGraph({
        config,
        node_table: nodeTable,
        edge_table: edgeTable,
        node_mapping: JSON.parse(nodeMapping),
        edge_mapping: JSON.parse(edgeMapping)
      });
      onLoadGraph(graph, 'postgres');
      onError(undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'PostgreSQL graph load failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-section">
      <div className="section-title">数据源</div>
      <div className="source-card">
        <FileSpreadsheet size={18} />
        <div>
          <strong>{source}</strong>
          <small>{source === 'mock' ? '后端不可用时使用内置样例' : '当前图谱数据源'}</small>
        </div>
      </div>
      <div className="source-card dimmed">
        <Database size={18} />
        <div>
          <strong>PostgreSQL</strong>
          <small>连接测试、字段映射、读取图谱</small>
        </div>
      </div>
      <div className="datasource-form">
        <div className="form-grid">
          <input value={config.host} onChange={(event) => updateConfig('host', event.target.value)} placeholder="host" />
          <input value={config.port} onChange={(event) => updateConfig('port', event.target.value)} placeholder="port" />
          <input value={config.database} onChange={(event) => updateConfig('database', event.target.value)} placeholder="database" />
          <input value={config.schema} onChange={(event) => updateConfig('schema', event.target.value)} placeholder="schema" />
          <input value={config.username} onChange={(event) => updateConfig('username', event.target.value)} placeholder="username" />
          <input value={config.password} onChange={(event) => updateConfig('password', event.target.value)} placeholder="password" type="password" />
          <input value={nodeTable} onChange={(event) => setNodeTable(event.target.value)} placeholder="node table" />
          <input value={edgeTable} onChange={(event) => setEdgeTable(event.target.value)} placeholder="edge table" />
        </div>
        <textarea value={nodeMapping} onChange={(event) => setNodeMapping(event.target.value)} aria-label="node mapping" />
        <textarea value={edgeMapping} onChange={(event) => setEdgeMapping(event.target.value)} aria-label="edge mapping" />
        <div className="form-actions">
          <button type="button" onClick={runTest} disabled={busy}>
            <PlugZap size={14} />
            测试
          </button>
          <button type="button" onClick={runLoad} disabled={busy}>
            <Database size={14} />
            读取
          </button>
        </div>
      </div>
      {error && <p className="hint">{error}</p>}
    </section>
  );
}
