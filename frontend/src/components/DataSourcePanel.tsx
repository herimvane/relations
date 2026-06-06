import { useState } from 'react';
import { AlertCircle, CheckCircle2, Database, FileSpreadsheet, LoaderCircle, PlugZap, RotateCcw } from 'lucide-react';
import { loadPostgresGraph, PostgresConfig, testPostgres } from '../api/datasourceApi';
import { GraphData } from '../types/graph';

type Props = {
  source: string;
  status: string;
  loading: boolean;
  error?: string;
  onLoadMock: () => void;
  onLoadGraph: (graph: GraphData, source: string) => void;
  onError: (message?: string) => void;
};

const defaultConfig: PostgresConfig = {
  host: '127.0.0.1',
  port: 5432,
  database: 'postgres',
  username: 'herimvane',
  password: '',
  schema: 'public'
};

function sourceLabel(source: string) {
  if (source === 'loading') return '加载中';
  if (source === 'mock') return 'Mock 数据';
  if (source === 'api') return '后端图谱';
  if (source === 'postgres') return 'PostgreSQL';
  if (source === 'table') return '二维表抽取';
  if (source.startsWith('excel:')) return 'Excel 导入';
  if (source.startsWith('csv:')) return 'CSV 导入';
  return source;
}

function sourceDetail(source: string) {
  if (source.startsWith('excel:')) return source.slice('excel:'.length);
  if (source.startsWith('csv:')) return source.slice('csv:'.length);
  return source;
}

export function DataSourcePanel({ source, status, loading, error, onLoadMock, onLoadGraph, onError }: Props) {
  const [config, setConfig] = useState<PostgresConfig>(defaultConfig);
  const [nodeTable, setNodeTable] = useState('nodes');
  const [edgeTable, setEdgeTable] = useState('edges');
  const [nodeMapping, setNodeMapping] = useState('{"id":"id","name":"name","type":"type","group":"group","weight":"weight"}');
  const [edgeMapping, setEdgeMapping] = useState('{"source":"source","target":"target","relation_type":"relation_type","weight":"weight"}');
  const [busy, setBusy] = useState(false);
  const [dbStatus, setDbStatus] = useState<'idle' | 'testing' | 'connected' | 'loading' | 'loaded' | 'failed'>('idle');
  const [dbMessage, setDbMessage] = useState('未测试连接');

  const updateConfig = (key: keyof PostgresConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: key === 'port' ? Number(value) : value }));
    setDbStatus('idle');
    setDbMessage('配置已变更，请重新测试');
  };

  const runTest = async () => {
    setBusy(true);
    setDbStatus('testing');
    setDbMessage('正在测试 PostgreSQL 连接...');
    try {
      const result = await testPostgres(config);
      setDbStatus(result.ok ? 'connected' : 'failed');
      setDbMessage(result.ok ? '连接成功，可以读取图谱数据' : '连接测试未通过');
      onError(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PostgreSQL connection failed';
      setDbStatus('failed');
      setDbMessage(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const runLoad = async () => {
    setBusy(true);
    setDbStatus('loading');
    setDbMessage('正在读取节点和关系...');
    try {
      const graph = await loadPostgresGraph({
        config,
        node_table: nodeTable,
        edge_table: edgeTable,
        node_mapping: JSON.parse(nodeMapping),
        edge_mapping: JSON.parse(edgeMapping)
      });
      onLoadGraph(graph, 'postgres');
      setDbStatus('loaded');
      setDbMessage(`已读取 ${graph.nodes.length} 个节点 / ${graph.edges.length} 条关系`);
      onError(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PostgreSQL graph load failed';
      setDbStatus('failed');
      setDbMessage(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-section">
      <div className="section-title">数据源</div>
      <div className="source-card" title={sourceDetail(source)}>
        <FileSpreadsheet size={18} />
        <div className="source-body">
          <strong>{sourceLabel(source)}</strong>
          <small>{loading ? status : status || (source === 'mock' ? '后端不可用时使用内置样例' : '当前图谱数据源')}</small>
        </div>
        <button type="button" className="source-action" disabled={loading || source === 'mock'} onClick={onLoadMock} title="切回内置 Mock 数据">
          <RotateCcw size={14} />
        </button>
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
        <div className={`db-status ${dbStatus}`}>
          {dbStatus === 'testing' || dbStatus === 'loading' ? <LoaderCircle size={14} className="spin" /> : dbStatus === 'failed' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{dbMessage}</span>
        </div>
        <div className="form-actions">
          <button type="button" onClick={runTest} disabled={busy}>
            <PlugZap size={14} />
            {dbStatus === 'testing' ? '测试中' : '测试'}
          </button>
          <button type="button" onClick={runLoad} disabled={busy}>
            <Database size={14} />
            {dbStatus === 'loading' ? '读取中' : '读取'}
          </button>
        </div>
      </div>
      {error && <p className="hint">{error}</p>}
    </section>
  );
}
