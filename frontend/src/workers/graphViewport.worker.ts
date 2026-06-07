import { GraphData, GraphEdge, GraphNode } from '../types/graph';
import { rankCoreNodes } from '../graph/coreScore';

type Request = {
  graph?: GraphData;
  focusId?: string;
  depth: number;
  detailLimit: number;
  clusterThreshold: number;
};

type BuildRequest = Request & {
  graph: GraphData;
};

type Response = {
  graph: GraphData;
  stats: {
    mode: 'detail' | 'clustered';
    sourceNodeCount: number;
    sourceEdgeCount: number;
    visibleNodeCount: number;
    visibleEdgeCount: number;
    hiddenNodeCount: number;
  };
};

function opposite(edge: GraphEdge, nodeId: string) {
  return edge.source === nodeId ? edge.target : edge.source;
}

function createEdgeCollector() {
  const refs = new WeakSet<GraphEdge>();
  const ids = new Set<string>();
  const edges: GraphEdge[] = [];

  return {
    add(edge: GraphEdge) {
      if (edge.id) {
        if (ids.has(edge.id)) return;
        ids.add(edge.id);
      } else {
        if (refs.has(edge)) return;
        refs.add(edge);
      }
      edges.push(edge);
    },
    values() {
      return edges;
    }
  };
}

function clusterId(group: string, type: string) {
  return `cluster:${group || 'unknown'}:${type || 'unknown'}`;
}

function makeClusterNode(group: string, type: string, count: number, weight: number): GraphNode {
  return {
    id: clusterId(group, type),
    name: `${group || '未分组'} ${type}`,
    type: '聚合簇',
    group,
    weight,
    properties: {
      聚合节点数: count,
      类型: type
    }
  };
}

function buildOverview(graph: GraphData, sourceNodeCount: number, sourceEdgeCount: number): Response {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const focusNodes = rankCoreNodes(graph).map((item) => item.node).slice(0, 8);
  const detailIds = new Set(focusNodes.map((node) => node.id));
  const detailEdges = createEdgeCollector();
  const clusters = new Map<string, { coreId: string; group: string; type: string; count: number; weight: number }>();

  focusNodes.forEach((core) => {
    const incident = graph.edges
      .filter((edge) => edge.source === core.id || edge.target === core.id)
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    incident.slice(0, 28).forEach((edge) => {
      detailEdges.add(edge);
      detailIds.add(opposite(edge, core.id));
    });
    incident.slice(28).forEach((edge) => {
      const node = nodeMap.get(opposite(edge, core.id));
      if (!node) return;
      const group = node.group ?? 'unknown';
      const key = `${core.id}:${group}:${node.type}`;
      const current = clusters.get(key) ?? { coreId: core.id, group, type: node.type, count: 0, weight: 0 };
      current.count += 1;
      current.weight += edge.weight ?? 1;
      clusters.set(key, current);
    });
  });

  const clusterNodes = Array.from(clusters.values()).map((cluster) => ({
    ...makeClusterNode(cluster.group, cluster.type, cluster.count, Math.min(100, Math.round(cluster.weight / cluster.count))),
    id: clusterId(`${cluster.coreId}:${cluster.group}`, cluster.type)
  }));
  const clusterEdges = Array.from(clusters.values()).map((cluster) => ({
    id: `edge:${cluster.coreId}:${clusterId(`${cluster.coreId}:${cluster.group}`, cluster.type)}`,
    source: cluster.coreId,
    target: clusterId(`${cluster.coreId}:${cluster.group}`, cluster.type),
    relation_type: '聚合',
    weight: Math.min(100, Math.round(cluster.weight / Math.max(1, cluster.count))),
    properties: { 聚合关系数: cluster.count }
  }));
  const result = {
    nodes: [...graph.nodes.filter((node) => detailIds.has(node.id)), ...clusterNodes],
    edges: [...detailEdges.values(), ...clusterEdges]
  };

  return {
    graph: result,
    stats: {
      mode: 'clustered',
      sourceNodeCount,
      sourceEdgeCount,
      visibleNodeCount: result.nodes.length,
      visibleEdgeCount: result.edges.length,
      hiddenNodeCount: Math.max(0, sourceNodeCount - result.nodes.length)
    }
  };
}

function buildViewport({ graph, focusId, depth, detailLimit, clusterThreshold }: BuildRequest): Response {
  const sourceNodeCount = graph.nodes.length;
  const sourceEdgeCount = graph.edges.length;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!focusId) {
    return buildOverview(graph, sourceNodeCount, sourceEdgeCount);
  }
  const focus = nodeMap.get(focusId) ?? graph.nodes[0];

  if (!focus) {
    return {
      graph,
      stats: {
        mode: 'detail',
        sourceNodeCount,
        sourceEdgeCount,
        visibleNodeCount: graph.nodes.length,
        visibleEdgeCount: graph.edges.length,
        hiddenNodeCount: 0
      }
    };
  }

  const adjacency = new Map<string, GraphEdge[]>();
  graph.edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge);
    adjacency.get(edge.target)!.push(edge);
  });

  const visited = new Set<string>([focus.id]);
  let frontier = new Set<string>([focus.id]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    frontier.forEach((id) => {
      adjacency.get(id)?.forEach((edge) => next.add(opposite(edge, id)));
    });
    next.forEach((id) => visited.add(id));
    frontier = next;
    if (visited.size > clusterThreshold * 8) break;
  }

  const visibleEdges = graph.edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target));
  if (visited.size <= clusterThreshold) {
    const visibleNodes = graph.nodes.filter((node) => visited.has(node.id));
    return {
      graph: { nodes: visibleNodes, edges: visibleEdges },
      stats: {
        mode: 'detail',
        sourceNodeCount,
        sourceEdgeCount,
        visibleNodeCount: visibleNodes.length,
        visibleEdgeCount: visibleEdges.length,
        hiddenNodeCount: Math.max(0, sourceNodeCount - visibleNodes.length)
      }
    };
  }

  const incidentEdges = [...(adjacency.get(focus.id) ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const detailIds = new Set<string>([focus.id]);
  incidentEdges.slice(0, detailLimit).forEach((edge) => detailIds.add(opposite(edge, focus.id)));

  if (depth > 1) {
    const secondHopBudget = Math.floor(detailLimit * 0.55);
    const candidates: GraphEdge[] = [];
    detailIds.forEach((id) => {
      if (id !== focus.id) candidates.push(...(adjacency.get(id) ?? []));
    });
    candidates
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, secondHopBudget)
      .forEach((edge) => {
        detailIds.add(edge.source);
        detailIds.add(edge.target);
      });
  }

  if (depth > 2) {
    const thirdHopBudget = Math.floor(detailLimit * 0.35);
    const candidates: GraphEdge[] = [];
    detailIds.forEach((id) => candidates.push(...(adjacency.get(id) ?? [])));
    candidates
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, thirdHopBudget)
      .forEach((edge) => {
        detailIds.add(edge.source);
        detailIds.add(edge.target);
      });
  }

  const detailNodes = graph.nodes.filter((node) => detailIds.has(node.id));
  const clusters = new Map<string, { group: string; type: string; count: number; weight: number; edgeWeight: number }>();
  const clusterEdges = new Map<string, GraphEdge>();

  visited.forEach((id) => {
    if (detailIds.has(id) || id === focus.id) return;
    const node = nodeMap.get(id);
    if (!node) return;
    const key = clusterId(node.group ?? 'unknown', node.type);
    const current = clusters.get(key) ?? {
      group: node.group ?? 'unknown',
      type: node.type,
      count: 0,
      weight: 0,
      edgeWeight: 0
    };
    current.count += 1;
    current.weight += node.weight ?? 1;
    clusters.set(key, current);
  });

  incidentEdges.forEach((edge) => {
    const other = nodeMap.get(opposite(edge, focus.id));
    if (!other || detailIds.has(other.id)) return;
    const id = clusterId(other.group ?? 'unknown', other.type);
    const current = clusters.get(id);
    if (!current) return;
    current.edgeWeight += edge.weight ?? 1;
    clusterEdges.set(id, {
      id: `edge:${focus.id}:${id}`,
      source: focus.id,
      target: id,
      relation_type: '聚合',
      weight: Math.min(100, Math.round(current.edgeWeight / Math.max(1, current.count))),
      properties: { 聚合关系数: current.count }
    });
  });

  const clusterNodes = Array.from(clusters.values()).map((cluster) =>
    makeClusterNode(cluster.group, cluster.type, cluster.count, Math.min(100, Math.round(cluster.weight / cluster.count)))
  );
  const detailEdges = graph.edges
    .filter((edge) => detailIds.has(edge.source) && detailIds.has(edge.target))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, detailLimit * 3);

  const result = {
    nodes: [...detailNodes, ...clusterNodes],
    edges: [...detailEdges, ...clusterEdges.values()]
  };

  return {
    graph: result,
    stats: {
      mode: 'clustered',
      sourceNodeCount,
      sourceEdgeCount,
      visibleNodeCount: result.nodes.length,
      visibleEdgeCount: result.edges.length,
      hiddenNodeCount: Math.max(0, sourceNodeCount - result.nodes.length)
    }
  };
}

let currentGraph: GraphData | undefined;

self.onmessage = (event: MessageEvent<Request>) => {
  if (event.data.graph) currentGraph = event.data.graph;
  if (!currentGraph) {
    self.postMessage({
      graph: { nodes: [], edges: [] },
      stats: {
        mode: 'detail',
        sourceNodeCount: 0,
        sourceEdgeCount: 0,
        visibleNodeCount: 0,
        visibleEdgeCount: 0,
        hiddenNodeCount: 0
      }
    } satisfies Response);
    return;
  }
  self.postMessage(buildViewport({ ...event.data, graph: currentGraph }));
};
