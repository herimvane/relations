import { GraphData, GraphEdge, GraphNode, GraphPath } from '../types/graph';

const PATH_SEPARATORS = ['::', '->', '到'];

type PathQuery = {
  sourceText: string;
  targetText: string;
};

type SearchOptions = {
  maxDepth?: number;
  maxPaths?: number;
  maxBranching?: number;
  maxIterations?: number;
};

export function parsePathQuery(query: string): PathQuery | undefined {
  const normalized = query.trim();
  if (!normalized) return undefined;

  const separator = PATH_SEPARATORS.find((item) => normalized.includes(item));
  if (!separator) return undefined;

  const [sourceText, targetText] = normalized.split(separator).map((item) => item.trim()).filter(Boolean);
  if (!sourceText || !targetText) return undefined;
  return { sourceText, targetText };
}

export function findNodeByText(nodes: GraphNode[], text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;

  return (
    nodes.find((node) => node.id.toLowerCase() === normalized || node.name.toLowerCase() === normalized) ??
    nodes.find((node) => node.name.toLowerCase().includes(normalized) || node.id.toLowerCase().includes(normalized))
  );
}

function edgeKey(edge: GraphEdge) {
  return edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`;
}

function edgeSignatures(edge: GraphEdge) {
  const relation = edge.relation_type || '';
  return [
    edge.id,
    `${edge.source}->${edge.target}::${relation}`,
    `${edge.target}->${edge.source}::${relation}`,
    [edge.source, edge.target].sort().join('<->') + `::${relation}`
  ].filter((item): item is string => Boolean(item));
}

export function searchGraphPaths(
  graph: GraphData,
  source: GraphNode,
  target: GraphNode,
  options: SearchOptions = {}
): GraphPath[] {
  const maxDepth = options.maxDepth ?? 4;
  const maxPaths = options.maxPaths ?? 20;
  const maxBranching = options.maxBranching ?? 72;
  const maxIterations = options.maxIterations ?? 18000;
  const nodeIndex = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, GraphEdge[]>();

  graph.edges.forEach((edge) => {
    if (!nodeIndex.has(edge.source) || !nodeIndex.has(edge.target)) return;
    const sourceEdges = adjacency.get(edge.source) ?? [];
    sourceEdges.push(edge);
    adjacency.set(edge.source, sourceEdges);

    const targetEdges = adjacency.get(edge.target) ?? [];
    targetEdges.push(edge);
    adjacency.set(edge.target, targetEdges);
  });

  adjacency.forEach((edges) => {
    edges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  });

  const stack = [
    {
      nodeId: source.id,
      nodeIds: [source.id],
      edgeTrail: [] as GraphEdge[],
      seen: new Set([source.id])
    }
  ];
  const paths: GraphPath[] = [];
  let iterations = 0;

  while (stack.length > 0 && paths.length < maxPaths && iterations < maxIterations) {
    iterations += 1;
    const current = stack.pop()!;
    if (current.edgeTrail.length >= maxDepth) continue;

    const nextEdges = (adjacency.get(current.nodeId) ?? []).slice(0, maxBranching);
    nextEdges.forEach((edge) => {
      const nextNodeId = edge.source === current.nodeId ? edge.target : edge.source;
      if (current.seen.has(nextNodeId)) return;

      const nextNodeIds = [...current.nodeIds, nextNodeId];
      const nextEdgeTrail = [...current.edgeTrail, edge];

      if (nextNodeId === target.id) {
        const nodes = nextNodeIds.map((id) => nodeIndex.get(id)).filter((node): node is GraphNode => Boolean(node));
        const score = nextEdgeTrail.reduce((total, item) => total + (item.weight ?? 0), 0) / Math.max(nextEdgeTrail.length, 1);
        paths.push({
          id: nextEdgeTrail.map(edgeKey).join('|'),
          nodes,
          edges: nextEdgeTrail,
          score
        });
        return;
      }

      stack.push({
        nodeId: nextNodeId,
        nodeIds: nextNodeIds,
        edgeTrail: nextEdgeTrail,
        seen: new Set([...current.seen, nextNodeId])
      });
    });
  }

  return paths
    .sort((a, b) => b.score - a.score || a.edges.length - b.edges.length)
    .slice(0, maxPaths);
}

export function mergeGraphWithPath(graph: GraphData, path?: GraphPath): GraphData {
  if (!path) return graph;

  const nodeIndex = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeIndex = new Set(graph.edges.flatMap(edgeSignatures));
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];

  path.nodes.forEach((node) => {
    if (!nodeIndex.has(node.id)) {
      nodeIndex.set(node.id, node);
      nodes.push(node);
    }
  });
  path.edges.forEach((edge) => {
    const signatures = edgeSignatures(edge);
    if (!signatures.some((signature) => edgeIndex.has(signature))) {
      signatures.forEach((signature) => edgeIndex.add(signature));
      edges.push(edge);
    }
  });

  return { nodes, edges };
}
