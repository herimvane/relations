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

export type ViewLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type CommunitySummary = {
  id: string;
  name: string;
  node_count: number;
  edge_count?: number;
  importance?: number;
};

export type GraphViewResponse = GraphData & {
  view_level: ViewLevel;
  title: string;
  communities?: CommunitySummary[];
  stats?: {
    total_nodes: number;
    total_edges: number;
    visible_nodes: number;
    visible_edges: number;
    hidden_nodes: number;
  };
};

export type GraphDataset = 'social' | 'enterprise';

export type GraphViewState = {
  level: ViewLevel;
  dataset: GraphDataset;
  id?: string;
  title: string;
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
