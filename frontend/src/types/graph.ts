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
  can_drill?: boolean;
  complete?: boolean;
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
  canDrill?: boolean;
  complete?: boolean;
};

export type GraphPath = {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  score: number;
};

export type NodeSearchResult = GraphNode & {
  degree?: number;
  source?: 'view' | 'database';
};

export type GraphViewCommand = {
  type: 'zoom-in' | 'zoom-out' | 'fit' | 'drill-in' | 'drill-out';
  nonce: number;
  origin?: {
    id: string;
    x?: number;
    y?: number;
    z?: number;
  };
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

export type CommunityMethod = 'label' | 'louvain' | 'leiden' | 'connected' | 'existing';
export type ImportanceTemplate = 'auto' | 'social_default' | 'enterprise_risk' | 'transaction_monitoring' | 'ownership_control';

export type ImportanceFormulaComponent = {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  available: boolean;
  source: string;
  reason: string;
  scope?: string | null;
  field?: string | null;
  transform?: string | null;
};

export type ImportanceFormula = {
  detected_type: ImportanceTemplate | string;
  label: string;
  confidence: number;
  components: ImportanceFormulaComponent[];
};

export type ImportanceAvailableField = {
  key: string;
  label: string;
  scope: 'node' | 'edge' | string;
  field: string;
  type: 'number' | string;
  coverage: number;
  transform: 'minmax' | 'log' | 'sqrt' | string;
  reason: string;
};

export type ImportTopNode = {
  id: string;
  name: string;
  type: string;
  community_id: string;
  degree: number;
  importance_score: number;
};

export type ImportReport = {
  nodes: number;
  edges: number;
  isolated_nodes: number;
  missing_endpoint_edges: number;
  missing_node_ids: string[];
  communities: number;
  top_communities: [string, number][];
  relation_types: [string, number][];
  top_nodes: ImportTopNode[];
  community_method: CommunityMethod;
  importance_template: ImportanceTemplate;
  importance_template_label: string;
  importance_template_status: 'available' | 'degraded' | 'unavailable';
  importance_formula?: ImportanceFormula;
  available_importance_fields?: ImportanceAvailableField[];
  missing_required_fields: string[];
  missing_recommended_fields: string[];
  warnings: string[];
};

export type DatabaseImportResponse = {
  report: ImportReport;
  committed: boolean;
};

export type ImportPreviewJob = {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage?: string;
  stage_label?: string;
  stage_index?: number;
  stage_total?: number;
  message: string;
  report?: ImportReport | null;
  error?: string | null;
};
