export type GraphNode = {
  id: string;
  name: string;
  type: string;
  group?: string;
  weight?: number;
  properties?: Record<string, unknown>;
};

export type GraphEdge = {
  id?: string;
  source: string;
  target: string;
  relation_type: string;
  weight?: number;
  properties?: Record<string, unknown>;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphPath = {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  score: number;
};

export type GraphViewCommand = {
  type: 'zoom-in' | 'zoom-out' | 'fit';
  nonce: number;
};

export type NodePosition = GraphNode & {
  x: number;
  y: number;
  z: number;
};

export type GraphFilters = {
  nodeTypes: string[];
  relationTypes: string[];
  minWeight: number;
};
