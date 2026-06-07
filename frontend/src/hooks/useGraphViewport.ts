import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { GraphData, GraphEdge, GraphNode } from '../types/graph';
import { rankCoreNodes } from '../graph/coreScore';

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

type GraphIndexes = {
  nodeMap: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
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

function createEdgeCollector(initialEdges: GraphEdge[] = []) {
  const refs = new WeakSet<GraphEdge>();
  const ids = new Set<string>();
  const edges: GraphEdge[] = [];

  const add = (edge: GraphEdge) => {
    if (edge.id) {
      if (ids.has(edge.id)) return;
      ids.add(edge.id);
    } else {
      if (refs.has(edge)) return;
      refs.add(edge);
    }
    edges.push(edge);
  };

  initialEdges.forEach(add);
  return {
    add,
    values: () => edges
  };
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

const indexCache = new WeakMap<GraphData, GraphIndexes>();
const overviewCache = new WeakMap<GraphData, Map<string, WorkerResponse>>();

function buildIndexes(graph: GraphData): GraphIndexes {
  const cached = indexCache.get(graph);
  if (cached) return cached;

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, GraphEdge[]>();
  graph.edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge);
    adjacency.get(edge.target)!.push(edge);
  });
  const indexes = { nodeMap, adjacency };
  indexCache.set(graph, indexes);
  return indexes;
}

function pickAnchorNodes(graph: GraphData, limit = 8) {
  return rankCoreNodes(graph).map((item) => item.node).slice(0, limit);
}

function createOverviewViewport(graph: GraphData, anchorLimit = 12, perAnchorLimit = 30): WorkerResponse {
  const cacheKey = `${anchorLimit}:${perAnchorLimit}`;
  const cached = overviewCache.get(graph)?.get(cacheKey);
  if (cached) return cached;

  const { nodeMap, adjacency } = buildIndexes(graph);
  const focusNodes = pickAnchorNodes(graph, anchorLimit);
  const detailIds = new Set(focusNodes.map((node) => node.id));
  const detailEdges = createEdgeCollector();
  const clusterMap = new Map<string, { anchorId: string; group: string; type: string; count: number; weight: number }>();

  focusNodes.forEach((anchor) => {
    const incident = [...(adjacency.get(anchor.id) ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    incident.slice(0, perAnchorLimit).forEach((edge) => {
      detailEdges.add(edge);
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

  const response: WorkerResponse = {
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
  const graphCache = overviewCache.get(graph) ?? new Map<string, WorkerResponse>();
  graphCache.set(cacheKey, response);
  overviewCache.set(graph, graphCache);
  return response;
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
  const edgeCollector = createEdgeCollector();

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
    edgeCollector.add(edge);
  });

  visibleMembers.slice(0, 42).forEach((node) => {
    edgeCollector.add({
      id: `edge:${focusId}:${node.id}`,
      source: focusId,
      target: node.id,
      relation_type: '展开',
      weight: node.weight ?? 40,
      properties: { 来源: '聚合簇展开' }
    });
  });

  if (anchor) {
    edgeCollector.add({
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
    edgeCollector.add(edge);
  });

  const result = { nodes: [...nodeById.values()], edges: edgeCollector.values() };
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
  const edgeCollector = createEdgeCollector();
  [...overview.graph.edges, ...detailEdges, ...contextEdges, ...clusterEdges].forEach(edgeCollector.add);
  const edges = edgeCollector.values();
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

function createFallbackViewport(graph: GraphData): WorkerResponse {
  if (graph.nodes.length === 0) return { graph: { nodes: [], edges: [] }, stats: DEFAULT_STATS };
  const nodes = rankCoreNodes(graph).map((item) => item.node).slice(0, 80);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 180);
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

export function useGraphViewport(graph: GraphData, focusId: string | undefined, depth: number) {
  const [viewport, setViewport] = useState<WorkerResponse>({
    ...createFallbackViewport(graph)
  });
  const workerRef = useRef<Worker>();
  const requestIdRef = useRef(0);
  const workerGraphRef = useRef<GraphData>();

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (viewport.graph.nodes.length === 0 || workerGraphRef.current !== graph) {
      setViewport(createFallbackViewport(graph));
    }
    const worker =
      workerRef.current ??
      new Worker(new URL('../workers/graphViewport.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const shouldSendGraph = workerGraphRef.current !== graph;
    if (shouldSendGraph) workerGraphRef.current = graph;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (requestIdRef.current !== requestId) return;
      startTransition(() => setViewport(event.data));
    };
    worker.postMessage({
      graph: shouldSendGraph ? graph : undefined,
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
