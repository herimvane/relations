import { useMemo } from 'react';
import { GraphData, GraphNode, GraphPath } from '../types/graph';
import { PathQueryPanel } from './PathQueryPanel';

type Props = {
  selected?: GraphNode;
  hovered?: GraphNode;
  data: GraphData;
  pathResults: GraphPath[];
  activePathId?: string;
  pathQueryLabel?: string;
  onPickPath: (pathId: string) => void;
};

function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function displayProperties(properties?: Record<string, unknown>) {
  if (!properties) return [];
  const entries = Object.entries(properties);
  if (entries.length === 1 && entries[0][0] === 'properties' && typeof entries[0][1] === 'object' && entries[0][1] !== null) {
    if (Array.isArray(entries[0][1])) return entries;
    return Object.entries(entries[0][1] as Record<string, unknown>);
  }
  return entries;
}

export function RightPanel({ selected, hovered, data, pathResults, activePathId, pathQueryLabel, onPickPath }: Props) {
  const node = hovered ?? selected;
  const degreeIndex = useMemo(() => {
    const index = new Map<string, number>();
    data.edges.forEach((edge) => {
      index.set(edge.source, (index.get(edge.source) ?? 0) + 1);
      index.set(edge.target, (index.get(edge.target) ?? 0) + 1);
    });
    return index;
  }, [data.edges]);
  const degree = node ? degreeIndex.get(node.id) ?? 0 : 0;
  const properties = displayProperties(node?.properties);

  return (
    <aside className="right-panel">
      <section className="panel-section node-detail">
        <div className="section-title">节点详情</div>
        {!node ? (
          <p className="empty">悬停或点击节点查看详情</p>
        ) : (
          <>
            <h2>{node.name}</h2>
            <div className="meta-grid">
              <span>ID</span>
              <strong>{node.id}</strong>
              <span>类型</span>
              <strong>{node.type}</strong>
              <span>分组</span>
              <strong>{node.group ?? '-'}</strong>
              <span>权重</span>
              <strong>{node.weight ?? 0}</strong>
              <span>度数</span>
              <strong>{degree}</strong>
            </div>
            {properties.length > 0 && (
              <div className="property-list">
                {properties.map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong title={formatPropertyValue(value)}>{formatPropertyValue(value)}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <PathQueryPanel
        selected={selected}
        nodes={data.nodes}
        edges={data.edges}
        paths={pathResults}
        activePathId={activePathId}
        queryLabel={pathQueryLabel}
        onPickPath={onPickPath}
      />
    </aside>
  );
}
