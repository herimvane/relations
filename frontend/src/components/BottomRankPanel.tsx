import { useMemo } from 'react';
import { GraphEdge } from '../types/graph';

type Props = {
  edges: GraphEdge[];
};

export function BottomRankPanel({ edges }: Props) {
  const topEdges = useMemo(() => [...edges].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 7), [edges]);
  return (
    <footer className="bottom-rank">
      <div className="rank-title">Top 关系榜单</div>
      {topEdges.map((edge, index) => (
        <div className="rank-item" key={edge.id ?? `${edge.source}-${edge.target}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{edge.relation_type}</strong>
          <small>{edge.source} → {edge.target}</small>
          <b>{edge.weight ?? 0}</b>
        </div>
      ))}
    </footer>
  );
}
