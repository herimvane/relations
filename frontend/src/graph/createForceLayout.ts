import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  SimulationNodeDatum
} from 'd3-force';
import { GraphData, NodePosition } from '../types/graph';

type SimNode = SimulationNodeDatum & NodePosition;

function createLargeGraphLayout(data: GraphData): NodePosition[] {
  const degree = new Map<string, number>();
  data.edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });
  const ranked = [...data.nodes].sort((a, b) => {
    const scoreA = (a.weight ?? 0) * 1.8 + (degree.get(a.id) ?? 0) * 11;
    const scoreB = (b.weight ?? 0) * 1.8 + (degree.get(b.id) ?? 0) * 11;
    return scoreB - scoreA;
  });
  const centerId = ranked[0]?.id;
  const anchorIndex = new Map(ranked.slice(0, 10).map((node, index) => [node.id, index]));
  const centerNeighbors = new Set<string>();
  data.edges.forEach((edge) => {
    if (edge.source === centerId) centerNeighbors.add(edge.target);
    if (edge.target === centerId) centerNeighbors.add(edge.source);
  });

  return data.nodes.map((node, index) => {
    if (node.id === centerId) {
      return { ...node, x: 0, y: 0, z: 0 };
    }

    const anchorRank = anchorIndex.get(node.id);
    if (anchorRank !== undefined) {
      const angle = (Math.PI * 2 * anchorRank) / Math.max(2, anchorIndex.size - 1);
      const radius = 135 + anchorRank * 24;
      return {
        ...node,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.72,
        z: Math.sin(angle * 1.9) * 180
      };
    }

    if (centerNeighbors.has(node.id)) {
      const neighborIndex = Array.from(centerNeighbors).indexOf(node.id);
      const angle = neighborIndex * 2.399963229728653;
      const shell = 190 + (neighborIndex % 4) * 54;
      const layer = ((neighborIndex * 17) % 11) - 5;
      return {
        ...node,
        x: Math.cos(angle) * shell,
        y: Math.sin(angle) * shell * 0.72,
        z: layer * 72 + Math.sin(angle * 1.3) * 120
      };
    }

    const angle = index * 2.399963229728653;
    const shell = Math.sqrt(index + 9);
    const weightedPull = Math.max(0, 100 - (node.weight ?? 20)) * 1.8;
    const radius = 145 + shell * 22 + weightedPull;
    const armOffset = Math.sin(index * 0.037) * 86;
    const depth = Math.sin(index * 0.173) * 420 + (((index * 37) % 127) - 63) * 6.2;

    return {
      ...node,
      x: Math.cos(angle) * (radius + armOffset),
      y: Math.sin(angle) * (radius * 0.68 + armOffset * 0.45),
      z: depth
    };
  });
}

export function createForceLayout(data: GraphData): NodePosition[] {
  const hasClusterNodes = data.nodes.some((node) => node.type === '聚合簇');
  if (data.nodes.length > 2500 || hasClusterNodes || data.nodes.length > 80) {
    return createLargeGraphLayout(data);
  }

  const nodes: SimNode[] = data.nodes.map((node, index) => {
    const angle = (index / Math.max(1, data.nodes.length)) * Math.PI * 2;
    const radius = 120 + (index % 11) * 28;
    const depthBand = ((index * 37) % 17) - 8;
    return {
      ...node,
      x: Math.cos(angle) * radius * (1 + (index % 5) * 0.035),
      y: Math.sin(angle) * radius * 0.72,
      z: depthBand * 30 + Math.sin(index * 1.7) * 36
    };
  });

  const links = data.edges.map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight ?? 1 }));

  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string; weight: number }>(links)
        .id((node) => node.id)
        .distance((link) => Math.max(56, 190 - link.weight))
        .strength((link) => Math.min(0.9, 0.12 + link.weight / 160))
    )
    .force('charge', forceManyBody().strength(-120))
    .force('collide', forceCollide<SimNode>().radius((node) => 18 + (node.weight ?? 10) / 8))
    .force('radial', forceRadial<SimNode>((node) => 230 + (100 - (node.weight ?? 20)) * 2.1).strength(0.08))
    .force('center', forceCenter(0, 0))
    .stop();

  for (let i = 0; i < 360; i += 1) simulation.tick();

  return nodes.map((node) => ({
    ...node,
    x: node.x ?? 0,
    y: node.y ?? 0,
    z: node.z
  }));
}
