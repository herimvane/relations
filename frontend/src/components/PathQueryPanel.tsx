import { GraphEdge, GraphNode } from '../types/graph';

type Props = {
  selected?: GraphNode;
  edges: GraphEdge[];
};

export function PathQueryPanel({ selected, edges }: Props) {
  const related = selected
    ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    : [];

  return (
    <section className="panel-section">
      <div className="section-title">关联路径</div>
      {related.length === 0 ? (
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
