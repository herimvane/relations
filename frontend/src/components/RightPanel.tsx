import { GraphData, GraphNode } from '../types/graph';
import { PathQueryPanel } from './PathQueryPanel';

type Props = {
  selected?: GraphNode;
  hovered?: GraphNode;
  data: GraphData;
};

export function RightPanel({ selected, hovered, data }: Props) {
  const node = hovered ?? selected;
  const degree = node ? data.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length : 0;

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
            {node.properties && (
              <div className="property-list">
                {Object.entries(node.properties).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <PathQueryPanel selected={selected} edges={data.edges} />
    </aside>
  );
}
