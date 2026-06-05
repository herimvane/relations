import { GraphData } from '../types/graph';

export function neighborIds(data: GraphData, nodeId?: string, depth = 1) {
  if (!nodeId) return new Set<string>();
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    data.edges.forEach((edge) => {
      if (frontier.has(edge.source)) next.add(edge.target);
      if (frontier.has(edge.target)) next.add(edge.source);
    });
    next.forEach((id) => {
      if (!visited.has(id)) visited.add(id);
    });
    frontier = next;
  }
  return visited;
}

export function edgeTouches(edge: { source: string; target: string }, ids: Set<string>) {
  return ids.has(edge.source) && ids.has(edge.target);
}
