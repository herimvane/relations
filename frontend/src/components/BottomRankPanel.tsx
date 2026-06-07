import { useMemo } from 'react';
import { GraphEdge, GraphNode, GraphPath } from '../types/graph';

type Props = {
  edges: GraphEdge[];
  nodes: GraphNode[];
  activePath?: GraphPath;
  onPickEdge?: (edge: GraphEdge) => void;
};

function edgeKey(edge: GraphEdge) {
  return edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`;
}

export function BottomRankPanel({ edges, nodes, activePath, onPickEdge }: Props) {
  const nodeNameById = useMemo(() => new Map(nodes.map((node) => [node.id, node.name || node.id])), [nodes]);
  const rankedEdges = useMemo(() => {
    const sourceEdges = activePath?.edges.length ? activePath.edges : edges;
    return [...sourceEdges].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 7);
  }, [activePath, edges]);
  const title = activePath ? '路径关键关系' : '关键关系榜单';

  return (
    <footer className="bottom-rank">
      <div className="rank-title">{title}</div>
      {rankedEdges.map((edge, index) => (
        <button className="rank-item" key={`${edgeKey(edge)}-${index}`} type="button" onClick={() => onPickEdge?.(edge)}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{edge.relation_type}</strong>
          <small title={`${nodeNameById.get(edge.source) ?? edge.source} -> ${nodeNameById.get(edge.target) ?? edge.target}`}>
            {nodeNameById.get(edge.source) ?? edge.source} → {nodeNameById.get(edge.target) ?? edge.target}
          </small>
          <b>{edge.weight ?? 0}</b>
        </button>
      ))}
    </footer>
  );
}
