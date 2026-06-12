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

function isCommunityNode(node: { id: string; type: string }) {
  return node.type === '社区' || node.id.startsWith('community:');
}

function communityHaloRadius(node: { weight?: number; properties?: Record<string, unknown> }) {
  const nodeCount = Number(node.properties?.node_count ?? 1);
  const importance = Number(node.properties?.importance_score ?? (node.weight ?? 30) / 100);
  return Math.max(54, Math.min(118, 28 + Math.log1p(Math.max(1, nodeCount)) * 8.6 + importance * 28));
}

function edgeCount(edge: { weight?: number; properties?: Record<string, unknown> }) {
  return Number(edge.properties?.edge_count ?? edge.weight ?? 1);
}

function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function inflateToSphereVolume(
  nodes: NodePosition[],
  score: Map<string, number>,
  options: {
    minRadius: number;
    yScale?: number;
    depthJitter?: number;
    foregroundBias?: number;
    maxRadiusScale?: number;
    spatialBlend?: number;
    coreRadiusRatio?: number;
  }
) {
  const yScale = options.yScale ?? 0.94;
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const sortedByImportance = [...nodes].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
  const importanceRank = new Map(sortedByImportance.map((node, index) => [node.id, index]));
  const anchors = sortedByImportance.slice(0, Math.max(3, Math.min(16, Math.ceil(nodes.length * 0.08))));
  const weightSum = anchors.reduce((sum, node) => sum + 1 + (score.get(node.id) ?? 0) * 5, 0);
  const weightedCenter = anchors.reduce(
    (center, node) => {
      const weight = 1 + (score.get(node.id) ?? 0) * 5;
      center.x += node.x * weight;
      center.y += node.y * weight;
      return center;
    },
    { x: 0, y: 0 }
  );
  const centerX = weightedCenter.x / weightSum;
  const centerY = weightedCenter.y / weightSum;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const maxDimension = Math.max(width, height);
  const normalizeX = Math.min(2.2, maxDimension / width);
  const normalizeY = Math.min(2.2, maxDimension / height);
  const circularNodes = nodes.map((node) => {
    const importance = score.get(node.id) ?? 0;
    const centralPull = 1 - Math.pow(importance, 0.72) * 0.48;
    return {
      ...node,
      x: (node.x - centerX) * normalizeX * centralPull,
      y: (node.y - centerY) * normalizeY * centralPull
    };
  });
  const maxPlanarRadius = Math.max(1, ...circularNodes.map((node) => Math.hypot(node.x, node.y / yScale)));
  const sphereRadius = Math.max(options.minRadius, maxPlanarRadius * 1.08);
  const maxVisibleRadius = sphereRadius * (options.maxRadiusScale ?? 0.92);
  const spatialBlend = options.spatialBlend ?? 0.62;
  const coreRadiusRatio = options.coreRadiusRatio ?? 0.36;

  return circularNodes.map((node, index) => {
    const planarRadius = Math.hypot(node.x, node.y / yScale);
    const constrainedRadius = Math.min(planarRadius, maxVisibleRadius);
    const radiusScale = planarRadius > 0 ? constrainedRadius / planarRadius : 1;
    const constrainedX = node.x * radiusScale;
    const constrainedY = node.y * radiusScale;
    const normalizedPlanar = Math.min(0.96, constrainedRadius / sphereRadius);
    const sphericalZLimit = sphereRadius * Math.sqrt(Math.max(0, 1 - normalizedPlanar * normalizedPlanar));
    const randomDepth = stableUnit(`${node.id}-sphere-depth`);
    const depthSign = stableUnit(`${node.id}-sphere-depth-sign`) > 0.5 ? 1 : -1;
    const importance = score.get(node.id) ?? 0;
    const rank = importanceRank.get(node.id) ?? nodes.length;
    const centerBias = 1 - normalizedPlanar;
    const depthStrength = 0.18 + randomDepth * 0.78;
    const angle = Math.atan2(node.y, node.x);
    const organicAngle = angle + (stableUnit(`${node.id}-sphere-angle`) - 0.5) * 0.46;
    const organicRadius = 1 + Math.sin(angle * 3.1 + stableUnit(`${node.id}-organic`) * Math.PI * 2) * 0.055;
    const currentZ =
      depthSign * sphericalZLimit * depthStrength +
      Math.sin(index * 0.91) * (options.depthJitter ?? 80) +
      importance * centerBias * (options.foregroundBias ?? 150);
    const importanceShell = Math.pow(1 - importance, 0.72);
    let targetRadius =
      sphereRadius *
      clamp(
        0.12 + importanceShell * 0.74 + (stableUnit(`${node.id}-shell-jitter`) - 0.5) * 0.12,
        0.08,
        options.maxRadiusScale ?? 0.92
      );

    if (rank < anchors.length) {
      const rankRatio = anchors.length <= 1 ? 0 : rank / (anchors.length - 1);
      targetRadius = Math.min(targetRadius, sphereRadius * (0.055 + rankRatio * coreRadiusRatio));
    }

    const targetX = Math.cos(organicAngle) * targetRadius;
    const targetY = Math.sin(organicAngle) * targetRadius * yScale;
    const targetZ =
      (stableUnit(`${node.id}-volume-z`) * 2 - 1) *
        sphereRadius *
        (0.42 + stableUnit(`${node.id}-volume-depth`) * 0.34) +
      importance * (options.foregroundBias ?? 150);
    const nodeBlend = Math.max(spatialBlend, rank < anchors.length ? 0.84 : 0);
    const x = lerp(constrainedX, targetX, nodeBlend);
    const y = lerp(constrainedY, targetY, nodeBlend);
    const z = lerp(currentZ, targetZ, Math.max(0.62, spatialBlend));
    const perspectiveScale = 0.9 + (z / sphereRadius) * 0.09;
    return {
      ...node,
      x: x * perspectiveScale * organicRadius,
      y: y * perspectiveScale * organicRadius,
      z
    };
  });
}

function createCommunityLayout(data: GraphData): NodePosition[] {
  const ranked = rankCoreNodes(data);
  const score = new Map(ranked.map((item) => [item.node.id, item.score]));
  const nodes: SimNode[] = data.nodes.map((node, index) => {
    const angle = index * 2.399963229728653;
    const radius = 120 + Math.sqrt(index + 1) * 28 + (1 - (score.get(node.id) ?? 0)) * 280;
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.68,
      z: Math.sin(index * 0.73) * 260 + (((index * 19) % 13) - 6) * 30
    };
  });

  const links = data.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    edgeCount: edgeCount(edge),
    weight: edge.weight ?? 1
  }));

  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string; edgeCount: number; weight: number }>(links)
        .id((node) => node.id)
        .distance((link) => Math.max(110, 310 - Math.log1p(link.edgeCount) * 26 - link.weight * 0.7))
        .strength((link) => Math.min(0.72, 0.05 + Math.log1p(link.edgeCount) / 14))
    )
    .force('charge', forceManyBody<SimNode>().strength((node) => -160 - communityHaloRadius(node) * 2.2))
    .force('collide', forceCollide<SimNode>().radius((node) => communityHaloRadius(node) * 0.86).strength(0.94))
    .force('radial', forceRadial<SimNode>((node) => 95 + (1 - (score.get(node.id) ?? 0)) * 540).strength(0.18))
    .force('center', forceCenter(0, 0))
    .stop();

  for (let i = 0; i < 420; i += 1) simulation.tick();

  return inflateToSphereVolume(
    nodes.map((node) => ({ ...node, x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 })),
    score,
    { minRadius: 760, yScale: 0.98, depthJitter: 90, foregroundBias: 180, maxRadiusScale: 0.84, spatialBlend: 0.82, coreRadiusRatio: 0.22 }
  );
}

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

  const rawNodes = data.nodes.map((node, index) => {
    if (node.id === centerId) {
      return { ...node, x: 0, y: 0, z: 0 };
    }

    const anchorRank = anchorIndex.get(node.id);
    if (anchorRank !== undefined) {
      const angle = (Math.PI * 2 * Math.max(0, anchorRank - 1)) / Math.max(2, anchorIndex.size - 1);
      const radius = anchorRank <= 3 ? 54 + anchorRank * 18 : 112 + anchorRank * 18;
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
  return inflateToSphereVolume(rawNodes, coreScore, {
    minRadius: 720,
    yScale: 0.96,
    depthJitter: 120,
    foregroundBias: 190,
    maxRadiusScale: 0.9,
    spatialBlend: 0.74,
    coreRadiusRatio: 0.28
  });
}

export function createForceLayout(data: GraphData): NodePosition[] {
  const hasClusterNodes = data.nodes.some((node) => node.type === '聚合簇');
  const allCommunityNodes = data.nodes.length > 0 && data.nodes.every(isCommunityNode);
  if (allCommunityNodes) {
    return createCommunityLayout(data);
  }
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

  return inflateToSphereVolume(
    nodes.map((node) => ({
      ...node,
      x: node.x ?? 0,
      y: node.y ?? 0,
      z: node.z ?? 0
    })),
    coreScore,
    { minRadius: 420, yScale: 0.96, depthJitter: 70, foregroundBias: 120, maxRadiusScale: 0.9, spatialBlend: 0.66, coreRadiusRatio: 0.34 }
  );
}
