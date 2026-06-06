import { useMemo } from 'react';
import { GraphEdge, GraphNode, GraphPath } from '../types/graph';

type Props = {
  selected?: GraphNode;
  edges: GraphEdge[];
  paths: GraphPath[];
  activePathId?: string;
  queryLabel?: string;
  onPickPath: (pathId: string) => void;
};

export function PathQueryPanel({ selected, edges, paths, activePathId, queryLabel, onPickPath }: Props) {
  const related = useMemo(
    () =>
      selected
        ? edges
            .filter((edge) => edge.source === selected.id || edge.target === selected.id)
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        : [],
    [edges, selected]
  );

  return (
    <section className="panel-section">
      <div className="section-title">{paths.length > 0 || queryLabel ? '路径分析' : '关联路径'}</div>
      {paths.length > 0 ? (
        <div className="path-list">
          {paths.map((path, index) => (
            <button
              type="button"
              className={`path-row path-result ${path.id === activePathId ? 'active' : ''}`}
              key={path.id}
              onClick={() => onPickPath(path.id)}
            >
              <span className="path-rank">#{index + 1}</span>
              <span className="path-route">{path.nodes.map((node) => node.name).join(' -> ')}</span>
              <b>{path.edges.length}跳 / {Math.round(path.score)}</b>
            </button>
          ))}
        </div>
      ) : queryLabel ? (
        <p className="empty">未找到 {queryLabel} 的可展示路径</p>
      ) : related.length === 0 ? (
        <p className="empty">选择节点后查看一跳关联</p>
      ) : (
        <div className="path-list">
          {related.slice(0, 8).map((edge) => (
            <div className="path-row" key={edge.id ?? `${edge.source}-${edge.target}`}>
              <span>{edge.source}</span>
              <b>{edge.relation_type}</b>
              <span>{edge.target}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
