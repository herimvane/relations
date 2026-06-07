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
import { rankCoreNodes } from './coreScore';

type SimNode = SimulationNodeDatum & NodePosition;

function createLargeGraphLayout(data: GraphData): NodePosition[] {
  const ranked = rankCoreNodes(data);
  const centerId = ranked[0]?.node.id;
  const coreScore = new Map(ranked.map((item) => [item.node.id, item.score]));
  const anchorIndex = new Map(ranked.slice(0, 12).map((item, index) => [item.node.id, index]));
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
      const angle = (Math.PI * 2 * Math.max(0, anchorRank - 1)) / Math.max(2, anchorIndex.size - 1);
      const radius = 108 + anchorRank * 22;
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
    const scorePull = (1 - (coreScore.get(node.id) ?? 0)) * 180;
    const weightedPull = Math.max(0, 100 - (node.weight ?? 20)) * 1.2;
    const radius = 145 + shell * 22 + weightedPull + scorePull;
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

  const ranked = rankCoreNodes(data);
  const centerId = ranked[0]?.node.id;
  const coreScore = new Map(ranked.map((item) => [item.node.id, item.score]));
  const coreRank = new Map(ranked.slice(0, 8).map((item, index) => [item.node.id, index]));

  const nodes: SimNode[] = data.nodes.map((node, index) => {
    if (node.id === centerId) {
      return {
        ...node,
        x: 0,
        y: 0,
        z: 0,
        fx: 0,
        fy: 0
      };
    }

    const rank = coreRank.get(node.id);
    if (rank !== undefined) {
      const angle = ((rank - 1) / Math.max(1, coreRank.size - 1)) * Math.PI * 2;
      const radius = 120 + rank * 22;
      return {
        ...node,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.72,
        z: Math.sin(angle * 1.8) * 110
      };
    }

    const angle = (index / Math.max(1, data.nodes.length)) * Math.PI * 2;
    const radius = 150 + (index % 11) * 28 + (1 - (coreScore.get(node.id) ?? 0)) * 160;
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
    .force('radial', forceRadial<SimNode>((node) => (node.id === centerId ? 0 : 170 + (1 - (coreScore.get(node.id) ?? 0)) * 320)).strength(0.1))
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
