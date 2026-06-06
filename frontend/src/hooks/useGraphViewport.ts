import { useEffect, useMemo, useRef, useState } from 'react';
import { GraphData, GraphEdge, GraphNode } from '../types/graph';

type ViewportStats = {
  mode: 'detail' | 'clustered';
  sourceNodeCount: number;
  sourceEdgeCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  hiddenNodeCount: number;
};

type WorkerResponse = {
  graph: GraphData;
  stats: ViewportStats;
};

const DEFAULT_STATS: ViewportStats = {
  mode: 'detail',
  sourceNodeCount: 0,
  sourceEdgeCount: 0,
  visibleNodeCount: 0,
  visibleEdgeCount: 0,
  hiddenNodeCount: 0
};

function opposite(edge: GraphEdge, nodeId: string) {
  return edge.source === nodeId ? edge.target : edge.source;
}

function createClusterNode(group: string, type: string, count: number): GraphNode {
  return {
    id: `cluster:${group}:${type}`,
    name: `${group} ${type}`,
    type: '聚合簇',
    group,
    weight: Math.min(100, 36 + Math.log2(count + 1) * 10),
    properties: { 聚合节点数: count }
  };
}

function parseClusterFocusId(id?: string) {
  if (!id?.startsWith('cluster:')) return undefined;
  const [, first, second, ...rest] = id.split(':');
  if (!first || !second) return undefined;
  if (rest.length === 0) {
    return { anchorId: undefined, group: first, type: second };
  }
  return { anchorId: first, group: second, type: rest.join(':') };
}

function buildIndexes(graph: GraphData) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, GraphEdge[]>();
  graph.edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge);
    adjacency.get(edge.target)!.push(edge);
  });
  return { nodeMap, adjacency };
}

function pickAnchorNodes(graph: GraphData, adjacency: Map<string, GraphEdge[]>, limit = 8) {
  return [...graph.nodes]
    .sort((a, b) => {
      const scoreA = (a.weight ?? 0) * 1.8 + (adjacency.get(a.id)?.length ?? 0) * 9;
      const scoreB = (b.weight ?? 0) * 1.8 + (adjacency.get(b.id)?.length ?? 0) * 9;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

function createOverviewViewport(graph: GraphData, anchorLimit = 12, perAnchorLimit = 30): WorkerResponse {
  const { nodeMap, adjacency } = buildIndexes(graph);
  const focusNodes = pickAnchorNodes(graph, adjacency, anchorLimit);
  const detailIds = new Set(focusNodes.map((node) => node.id));
  const detailEdges = new Map<string, GraphEdge>();
  const clusterMap = new Map<string, { anchorId: string; group: string; type: string; count: number; weight: number }>();

  focusNodes.forEach((anchor) => {
    const incident = [...(adjacency.get(anchor.id) ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    incident.slice(0, perAnchorLimit).forEach((edge) => {
      detailEdges.set(edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`, edge);
      detailIds.add(opposite(edge, anchor.id));
    });
    incident.slice(perAnchorLimit).forEach((edge) => {
      const node = nodeMap.get(opposite(edge, anchor.id));
      if (!node) return;
      const group = node.group ?? 'unknown';
      const key = `${anchor.id}:${group}:${node.type}`;
      const current = clusterMap.get(key) ?? { anchorId: anchor.id, group, type: node.type, count: 0, weight: 0 };
      current.count += 1;
      current.weight += edge.weight ?? 1;
      clusterMap.set(key, current);
    });
  });

  const clusterNodes = Array.from(clusterMap.values()).map((cluster) => ({
    ...createClusterNode(`${cluster.group}`, cluster.type, cluster.count),
    id: `cluster:${cluster.anchorId}:${cluster.group}:${cluster.type}`,
    name: `${cluster.group} ${cluster.type}`
  }));
  const clusterEdges = Array.from(clusterMap.values()).map((cluster) => ({
    id: `edge:${cluster.anchorId}:cluster:${cluster.group}:${cluster.type}`,
    source: cluster.anchorId,
    target: `cluster:${cluster.anchorId}:${cluster.group}:${cluster.type}`,
    relation_type: '聚合',
    weight: Math.min(100, Math.round(cluster.weight / Math.max(1, cluster.count))),
    properties: { 聚合关系数: cluster.count }
  }));
  const nodes = [...graph.nodes.filter((node) => detailIds.has(node.id)), ...clusterNodes];
  const edges = [...detailEdges.values(), ...clusterEdges];

  return {
    graph: { nodes, edges },
    stats: {
      mode: 'clustered',
      sourceNodeCount: graph.nodes.length,
      sourceEdgeCount: graph.edges.length,
      visibleNodeCount: nodes.length,
      visibleEdgeCount: edges.length,
      hiddenNodeCount: Math.max(0, graph.nodes.length - nodes.length)
    }
  };
}

function createClusterViewport(graph: GraphData, focusId: string, depth: number): WorkerResponse {
  const parsed = parseClusterFocusId(focusId);
  if (!parsed) return createOverviewViewport(graph);

  const { nodeMap, adjacency } = buildIndexes(graph);
  const anchor = parsed.anchorId ? nodeMap.get(parsed.anchorId) : undefined;
  const clusterMembers = graph.nodes
    .filter((node) => (node.group ?? 'unknown') === parsed.group && node.type === parsed.type)
    .sort((a, b) => {
      const scoreA = (a.weight ?? 0) * 1.8 + (adjacency.get(a.id)?.length ?? 0) * 9;
      const scoreB = (b.weight ?? 0) * 1.8 + (adjacency.get(b.id)?.length ?? 0) * 9;
      return scoreB - scoreA;
    });
  const detailLimit = depth >= 3 ? 220 : depth >= 2 ? 150 : 96;
  const visibleMembers = clusterMembers.slice(0, detailLimit);
  const memberIds = new Set(visibleMembers.map((node) => node.id));
  const nodeById = new Map<string, GraphNode>();
  const edgeById = new Map<string, GraphEdge>();

  if (anchor) nodeById.set(anchor.id, anchor);
  visibleMembers.forEach((node) => nodeById.set(node.id, node));

  const clusterNode: GraphNode = {
    ...createClusterNode(parsed.group, parsed.type, clusterMembers.length),
    id: focusId,
    name: `${parsed.group} ${parsed.type}`,
    properties: {
      聚合节点数: clusterMembers.length,
      展开节点数: visibleMembers.length,
      锚点: parsed.anchorId ?? '-'
    }
  };
  nodeById.set(clusterNode.id, clusterNode);

  graph.edges.forEach((edge) => {
    const touchesAnchor = Boolean(anchor && (edge.source === anchor.id || edge.target === anchor.id));
    const bothVisible = memberIds.has(edge.source) && memberIds.has(edge.target);
    const connectsVisibleMember = touchesAnchor && (memberIds.has(edge.source) || memberIds.has(edge.target));
    if (!bothVisible && !connectsVisibleMember) return;
    edgeById.set(edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`, edge);
  });

  visibleMembers.slice(0, 42).forEach((node) => {
    edgeById.set(`edge:${focusId}:${node.id}`, {
      id: `edge:${focusId}:${node.id}`,
      source: focusId,
      target: node.id,
      relation_type: '展开',
      weight: node.weight ?? 40,
      properties: { 来源: '聚合簇展开' }
    });
  });

  if (anchor) {
    edgeById.set(`edge:${anchor.id}:${focusId}`, {
      id: `edge:${anchor.id}:${focusId}`,
      source: anchor.id,
      target: focusId,
      relation_type: '聚合',
      weight: clusterNode.weight,
      properties: { 聚合节点数: clusterMembers.length }
    });
  }

  const overview = createOverviewViewport(graph, 10, 18);
  overview.graph.nodes.forEach((node) => {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  });
  overview.graph.edges.forEach((edge) => {
    edgeById.set(edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`, edge);
  });

  const result = { nodes: [...nodeById.values()], edges: [...edgeById.values()] };
  return {
    graph: result,
    stats: {
      mode: 'clustered',
      sourceNodeCount: graph.nodes.length,
      sourceEdgeCount: graph.edges.length,
      visibleNodeCount: result.nodes.length,
      visibleEdgeCount: result.edges.length,
      hiddenNodeCount: Math.max(0, graph.nodes.length - result.nodes.length)
    }
  };
}

function createImmediateViewport(graph: GraphData, focusId: string | undefined, depth: number): WorkerResponse {
  if (!focusId) return createOverviewViewport(graph);
  if (focusId.startsWith('cluster:')) return createClusterViewport(graph, focusId, depth);

  const { nodeMap, adjacency } = buildIndexes(graph);
  const focus = (focusId && nodeMap.get(focusId)) ?? graph.nodes[0];
  if (!focus) return { graph: { nodes: [], edges: [] }, stats: DEFAULT_STATS };

  const incident = [...(adjacency.get(focus.id) ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const immediateDetailLimit = depth >= 3 ? 220 : depth >= 2 ? 145 : 80;
  const detailEdges = incident.slice(0, immediateDetailLimit);
  const detailIds = new Set<string>([focus.id]);
  detailEdges.forEach((edge) => detailIds.add(opposite(edge, focus.id)));

  const contextEdges: GraphEdge[] = [];
  const contextSeedLimit = depth >= 3 ? 48 : depth >= 2 ? 34 : 20;
  const contextPerNode = depth >= 3 ? 5 : depth >= 2 ? 4 : 2;
  detailEdges.slice(0, contextSeedLimit).forEach((edge) => {
    const neighborId = opposite(edge, focus.id);
    [...(adjacency.get(neighborId) ?? [])]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, contextPerNode)
      .forEach((candidate) => {
        contextEdges.push(candidate);
        detailIds.add(candidate.source);
        detailIds.add(candidate.target);
      });
  });

  const overview = createOverviewViewport(graph, 12, 22);
  overview.graph.nodes.forEach((node) => detailIds.add(node.id));

  const clusters = new Map<string, { group: string; type: string; count: number; weight: number }>();
  incident.slice(immediateDetailLimit).forEach((edge) => {
    const node = nodeMap.get(opposite(edge, focus.id));
    if (!node) return;
    const group = node.group ?? 'unknown';
    const key = `${group}:${node.type}`;
    const current = clusters.get(key) ?? { group, type: node.type, count: 0, weight: 0 };
    current.count += 1;
    current.weight += edge.weight ?? 1;
    clusters.set(key, current);
  });

  const clusterNodes = Array.from(clusters.values()).map((cluster) => createClusterNode(cluster.group, cluster.type, cluster.count));
  const clusterEdges = Array.from(clusters.values()).map((cluster) => ({
    id: `edge:${focus.id}:cluster:${cluster.group}:${cluster.type}`,
    source: focus.id,
    target: `cluster:${cluster.group}:${cluster.type}`,
    relation_type: '聚合',
    weight: Math.min(100, Math.round(cluster.weight / Math.max(1, cluster.count))),
    properties: { 聚合关系数: cluster.count }
  }));

  const nodeById = new Map<string, GraphNode>();
  graph.nodes.filter((node) => detailIds.has(node.id)).forEach((node) => nodeById.set(node.id, node));
  overview.graph.nodes.forEach((node) => nodeById.set(node.id, node));
  clusterNodes.forEach((node) => nodeById.set(node.id, node));
  const nodes = [...nodeById.values()];
  const uniqueEdges = new Map<string, GraphEdge>();
  [...overview.graph.edges, ...detailEdges, ...contextEdges, ...clusterEdges].forEach((edge) =>
    uniqueEdges.set(edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`, edge)
  );
  const edges = [...uniqueEdges.values()];
  return {
    graph: { nodes, edges },
    stats: {
      mode: clusterNodes.length ? 'clustered' : 'detail',
      sourceNodeCount: graph.nodes.length,
      sourceEdgeCount: graph.edges.length,
      visibleNodeCount: nodes.length,
      visibleEdgeCount: edges.length,
      hiddenNodeCount: Math.max(0, graph.nodes.length - nodes.length)
    }
  };
}

export function useGraphViewport(graph: GraphData, focusId: string | undefined, depth: number) {
  const [viewport, setViewport] = useState<WorkerResponse>({
    graph: { nodes: graph.nodes.slice(0, 1), edges: [] },
    stats: DEFAULT_STATS
  });
  const workerRef = useRef<Worker>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setViewport(createImmediateViewport(graph, focusId, depth));
    if (graph.nodes.length > 5000) return undefined;

    const worker =
      workerRef.current ??
      new Worker(new URL('../workers/graphViewport.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (requestIdRef.current !== requestId) return;
      setViewport(event.data);
    };
    worker.postMessage({
      graph,
      focusId,
      depth,
      detailLimit: 180 + depth * 90,
      clusterThreshold: 280 + depth * 180
    });

    return undefined;
  }, [depth, focusId, graph]);

  return useMemo(
    () => ({
      data: viewport.graph,
      stats: viewport.stats
    }),
    [viewport]
  );
}
