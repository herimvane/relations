import { GraphData, GraphNode } from '../types/graph';

export type CoreNodeScore = {
  node: GraphNode;
  score: number;
  degree: number;
  weightedStrength: number;
};

function typePriority(type: string) {
  if (/核心|主体|集团|Group/i.test(type)) return 1;
  if (/企业|公司|Enterprise/i.test(type)) return 0.86;
  if (/控制|实际控制|Actual Controller/i.test(type)) return 0.82;
  if (/家族长辈|核心人物|管家/i.test(type)) return 0.78;
  if (/股东|Shareholder/i.test(type)) return 0.68;
  if (/法人|代表|Legal Representative/i.test(type)) return 0.64;
  if (/人员|人物|Person/i.test(type)) return 0.52;
  return 0.42;
}

export function rankCoreNodes(data: GraphData): CoreNodeScore[] {
  const degree = new Map<string, number>();
  const weightedStrength = new Map<string, number>();

  data.edges.forEach((edge) => {
    const weight = Math.max(1, edge.weight ?? 1);
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    weightedStrength.set(edge.source, (weightedStrength.get(edge.source) ?? 0) + weight);
    weightedStrength.set(edge.target, (weightedStrength.get(edge.target) ?? 0) + weight);
  });

  const maxWeight = Math.max(1, ...data.nodes.map((node) => node.weight ?? 0));
  const maxDegree = Math.max(1, ...data.nodes.map((node) => degree.get(node.id) ?? 0));
  const maxStrength = Math.max(1, ...data.nodes.map((node) => weightedStrength.get(node.id) ?? 0));

  return data.nodes
    .map((node) => {
      const weightScore = (node.weight ?? 0) / maxWeight;
      const degreeScore = (degree.get(node.id) ?? 0) / maxDegree;
      const strengthScore = (weightedStrength.get(node.id) ?? 0) / maxStrength;
      const priorityScore = typePriority(node.type);
      return {
        node,
        degree: degree.get(node.id) ?? 0,
        weightedStrength: weightedStrength.get(node.id) ?? 0,
        score: weightScore * 0.35 + degreeScore * 0.4 + strengthScore * 0.2 + priorityScore * 0.05
      };
    })
    .sort((a, b) => b.score - a.score || (b.node.weight ?? 0) - (a.node.weight ?? 0));
}
