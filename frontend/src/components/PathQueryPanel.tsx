import { useMemo } from 'react';
import { GraphEdge, GraphNode, GraphPath } from '../types/graph';

type Props = {
  selected?: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: GraphPath[];
  activePathId?: string;
  queryLabel?: string;
  onPickPath: (pathId: string) => void;
};

export function PathQueryPanel({ selected, nodes, edges, paths, activePathId, queryLabel, onPickPath }: Props) {
  const nodeNameIndex = useMemo(() => new Map(nodes.map((node) => [node.id, node.name])), [nodes]);
  const related = useMemo(
    () =>
      selected
        ? edges
            .filter((edge) => edge.source === selected.id || edge.target === selected.id)
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        : [],
    [edges, selected]
  );
  const visibleRelated = related.slice(0, 8);
  const displayNode = (id: string) => nodeNameIndex.get(id) ?? id;
  const sectionTitle = paths.length > 0 || queryLabel
    ? `路径分析${paths.length > 0 ? ` ${paths.length} 条` : ''}`
    : `一跳关联${selected ? ` Top ${visibleRelated.length} / 共 ${related.length}` : ''}`;

  return (
    <section className="panel-section">
      <div className="section-title">{sectionTitle}</div>
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
          {visibleRelated.map((edge, index) => (
            <div className="path-row" key={edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}-${index}`}>
              <span title={edge.source}>{displayNode(edge.source)}</span>
              <b>{edge.relation_type}</b>
              <span title={edge.target}>{displayNode(edge.target)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
