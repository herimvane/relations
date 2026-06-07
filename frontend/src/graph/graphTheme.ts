import { GraphData, GraphNode } from '../types/graph';
import { rankCoreNodes } from './coreScore';

export type NodeTier = 'core' | 'primary' | 'secondary' | 'tertiary' | 'special';

export const nebulaTheme = {
  background: {
    canvas: '#05070D',
    center: '#0B1020',
    edge: '#03050A',
    fog: 0x05070d,
    dust: 0x9aa6bb
  },
  nodes: {
    core: {
      color: '#FFE8D6',
      glow: '#FF7A7A',
      core: '#FFF4E6'
    },
    primary: {
      color: '#FFF2A8',
      glow: '#FFD54F',
      core: '#FFF7C7'
    },
    secondary: {
      color: '#BEEBFF',
      glow: '#65D6FF',
      core: '#F0FBFF'
    },
    tertiary: {
      color: '#B8FFF3',
      glow: '#45F0D6',
      core: '#EFFFFB'
    },
    special: {
      color: '#D9C2FF',
      glow: '#A675FF',
      core: '#F2E9FF'
    }
  },
  edges: {
    default: {
      color: '#B4DCFF',
      opacity: 0.08
    },
    medium: {
      color: '#8CDCFF',
      opacity: 0.15
    },
    strong: {
      color: '#FFDC96',
      opacity: 0.25
    },
    extreme: {
      color: '#FF8C8C',
      opacity: 0.4
    }
  },
  path: {
    line: '#FF8C8C',
    particle: '#FFD0A6',
    nodeCore: '#FFFFFF',
    nodeGlow: '#FFB3B3'
  },
  interaction: {
    unrelatedNodeOpacity: 0.08,
    unrelatedEdgeOpacity: 0.05,
    hoverScale: 1.3,
    focusScale: 1.5
  },
  text: {
    label: '#DDE5F3',
    hover: '#FFFFFF',
    core: '#FFFFFF'
  },
  panel: {
    background: 'rgba(10,15,25,0.85)',
    border: 'rgba(255,255,255,0.08)',
    title: '#FFFFFF',
    content: '#BFC9D9',
    accent: '#FFD54F'
  }
};

function isSpecialNode(node: GraphNode) {
  const props = node.properties ?? {};
  const getProp = (keys: string[]) => {
    const entry = Object.entries(props).find(([key]) => keys.some((target) => key.toLowerCase() === target.toLowerCase()));
    return entry?.[1];
  };
  const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
  const truthy = (value: unknown) => value === true || ['true', '1', 'yes', '是'].includes(normalized(value));
  const positiveNumber = (value: unknown) => Number(value ?? 0) > 0;

  const riskLevel = normalized(getProp(['risk_level']));
  const risk = normalized(getProp(['risk']));
  const status = normalized(getProp(['status']));
  const tag = normalized(getProp(['tag']));

  if (['high', '高', '高风险'].includes(riskLevel)) return true;
  if (['high', '高风险'].includes(risk)) return true;
  if (['abnormal', '异常', '冻结', '注销', '吊销'].includes(status)) return true;
  if (/special|risk|abnormal|黑名单|失信|涉诉/.test(tag)) return true;
  if (truthy(getProp(['is_special']))) return true;
  if (truthy(getProp(['is_risk']))) return true;
  if (truthy(getProp(['is_abnormal']))) return true;
  if (truthy(getProp(['blacklist']))) return true;
  if (truthy(getProp(['sanctioned']))) return true;
  if (truthy(getProp(['dishonest']))) return true;
  if (positiveNumber(getProp(['lawsuit_count']))) return true;
  if (positiveNumber(getProp(['penalty_count']))) return true;

  return false;
}

export function buildNodeTierIndex(data: GraphData) {
  const ranked = rankCoreNodes(data);
  const index = new Map<string, NodeTier>();
  const total = data.nodes.length;
  const coreLimit = Math.min(Math.max(1, Math.floor(total * 0.01)), 30);
  const primaryLimit = Math.min(Math.floor(total * 0.08), 160);
  const secondaryLimit = Math.min(Math.floor(total * 0.3), 800);

  ranked.forEach(({ node }, rank) => {
    if (isSpecialNode(node)) {
      index.set(node.id, 'special');
      return;
    }
    if (rank < coreLimit) index.set(node.id, 'core');
    else if (rank < coreLimit + primaryLimit) index.set(node.id, 'primary');
    else if (rank < coreLimit + primaryLimit + secondaryLimit) index.set(node.id, 'secondary');
    else index.set(node.id, 'tertiary');
  });

  return index;
}

export function nodeStyleForTier(tier: NodeTier = 'tertiary') {
  return nebulaTheme.nodes[tier];
}

export function edgeStyleForWeight(weight = 1) {
  if (weight >= 88) return nebulaTheme.edges.extreme;
  if (weight >= 68) return nebulaTheme.edges.strong;
  if (weight >= 38) return nebulaTheme.edges.medium;
  return nebulaTheme.edges.default;
}
