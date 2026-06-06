import { GraphData } from '../types/graph';

const nodeTypes = ['核心主体', '企业', '人员', '项目', '账户', '事件'];
const groups = ['alpha', 'beta', 'gamma', 'delta', 'omega'];
const relationTypes = ['投资', '任职', '交易', '合作', '控制', '关联'];

export const mockGraph: GraphData = (() => {
  const nodes = Array.from({ length: 72 }, (_, index) => {
    const isCore = index === 0;
    return {
      id: `n-${index}`,
      name: isCore ? '星云核心主体' : `${nodeTypes[index % nodeTypes.length]} ${String(index).padStart(2, '0')}`,
      type: isCore ? '核心主体' : nodeTypes[index % nodeTypes.length],
      group: groups[index % groups.length],
      weight: isCore ? 100 : Math.round(16 + Math.random() * 72),
      properties: {
        风险评分: isCore ? 94 : Math.round(20 + Math.random() * 78),
        活跃度: Math.round(30 + Math.random() * 70),
        标签: isCore ? '中心节点' : `${groups[index % groups.length]} 分组`
      }
    };
  });

  const edges = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const hub = i % 7 === 0 ? Math.max(1, Math.floor(i / 3)) : 0;
    edges.push({
      id: `e-core-${i}`,
      source: nodes[hub].id,
      target: nodes[i].id,
      relation_type: relationTypes[i % relationTypes.length],
      weight: Math.round(20 + Math.random() * 80),
      properties: { 置信度: `${Math.round(70 + Math.random() * 29)}%` }
    });
  }

  for (let i = 1; i < nodes.length - 1; i += 1) {
    if (i % 2 === 0 || i % 5 === 0) {
      let targetIndex = (i * 3) % (nodes.length - 1) + 1;
      if (targetIndex === i) {
        targetIndex = targetIndex === nodes.length - 1 ? 1 : targetIndex + 1;
      }
      edges.push({
        id: `e-cross-${i}`,
        source: nodes[i].id,
        target: nodes[targetIndex].id,
        relation_type: relationTypes[(i + 2) % relationTypes.length],
        weight: Math.round(8 + Math.random() * 58),
        properties: { 来源: 'mock' }
      });
    }
  }

  return { nodes, edges };
})();
