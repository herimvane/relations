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

export function createForceLayout(data: GraphData): NodePosition[] {
  const nodes: SimNode[] = data.nodes.map((node, index) => {
    const angle = (index / Math.max(1, data.nodes.length)) * Math.PI * 2;
    const radius = node.id === 'n-0' ? 0 : 120 + (index % 11) * 28;
    const depthBand = ((index * 37) % 17) - 8;
    return {
      ...node,
      x: Math.cos(angle) * radius * (1 + (index % 5) * 0.035),
      y: Math.sin(angle) * radius * 0.72,
      z: node.id === 'n-0' ? 0 : depthBand * 30 + Math.sin(index * 1.7) * 36
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
    .force('charge', forceManyBody().strength((node) => ((node as SimNode).id === 'n-0' ? -540 : -120)))
    .force('collide', forceCollide<SimNode>().radius((node) => 18 + (node.weight ?? 10) / 8))
    .force('radial', forceRadial<SimNode>((node) => (node.id === 'n-0' ? 0 : 230 + (100 - (node.weight ?? 20)) * 2.1)).strength(0.08))
    .force('center', forceCenter(0, 0))
    .stop();

  for (let i = 0; i < 360; i += 1) simulation.tick();

  return nodes.map((node) => ({
    ...node,
    x: node.id === 'n-0' ? 0 : node.x ?? 0,
    y: node.id === 'n-0' ? 0 : node.y ?? 0,
    z: node.id === 'n-0' ? 0 : node.z
  }));
}
