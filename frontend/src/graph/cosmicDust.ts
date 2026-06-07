import * as THREE from 'three';
import { GraphData, GraphEdge, NodePosition } from '../types/graph';
import { CoreNodeScore, rankCoreNodes } from './coreScore';
import { edgeStyleForWeight, NodeTier, nodeStyleForTier } from './graphTheme';
import { edgeTouches } from './graphInteractions';

export const NETWORK_DUST_MAX = 6000;
export const HUB_DUST_MAX = 2500;

export type CosmicDustTextures = {
  dust: THREE.Texture;
  cloud: THREE.Texture;
  clouds?: THREE.Texture[];
};

export type CosmicDustInput = {
  data: GraphData;
  layout: NodePosition[];
  visibleEdges: GraphEdge[];
  highlightedPathEdges?: GraphEdge[];
  selectedNodeId?: string;
  activeIds: Set<string>;
  nodeTierIndex: Map<string, NodeTier>;
  hasPath: boolean;
  hasSelection: boolean;
  textures: CosmicDustTextures;
};

export type CosmicDustLayers = {
  cloudGroup: THREE.Group;
  dustGroup: THREE.Group;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value: string) {
  return hashString(value) / 4294967295;
}

function gaussian(seed: string) {
  const u = Math.max(0.0001, hashUnit(`${seed}-u`));
  const v = Math.max(0.0001, hashUnit(`${seed}-v`));
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function graphEdgeKey(edge: { id?: string; source: string; target: string; relation_type: string }) {
  return edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`;
}

function vecFromNode(node: NodePosition) {
  return new THREE.Vector3(node.x, node.y, node.z);
}

function rankedLayoutNodes(data: GraphData, nodeMap: Map<string, NodePosition>): NodePosition[] {
  return rankCoreNodes(data)
    .map((item: CoreNodeScore) => nodeMap.get(item.node.id))
    .filter((node): node is NodePosition => Boolean(node));
}

const NEBULA_CLOUD_ANCHORS: NodePosition[] = [
  { id: 'nebula-cloud-0', name: '', type: '', x: -360, y: 130, z: -420 },
  { id: 'nebula-cloud-1', name: '', type: '', x: 420, y: -80, z: -500 },
  { id: 'nebula-cloud-2', name: '', type: '', x: 40, y: 220, z: -560 },
  { id: 'nebula-cloud-3', name: '', type: '', x: -580, y: -210, z: -620 },
  { id: 'nebula-cloud-4', name: '', type: '', x: 620, y: 260, z: -680 },
  { id: 'nebula-cloud-5', name: '', type: '', x: 120, y: -310, z: -740 }
];

function createNebulaClouds(cloudTextures: THREE.Texture[]) {
  const cloudGroup = new THREE.Group();
  const cloudColors = [0x50b4ff, 0x7864ff, 0x50ffdc, 0xff78aa, 0xffd278];
  NEBULA_CLOUD_ANCHORS.forEach((node, index) => {
    const radius = 220 + hashUnit(`${node.id}-cloud-radius-${index}`) * 380;
    const elongation = 1.55 + hashUnit(`${node.id}-cloud-long-${index}`) * 1.25;
    const compression = 0.42 + hashUnit(`${node.id}-cloud-thin-${index}`) * 0.26;
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTextures[index % cloudTextures.length],
        color: cloudColors[index % cloudColors.length],
        transparent: true,
        opacity: 0.024 + hashUnit(`${node.id}-cloud-opacity-${index}`) * 0.04 + (index === 0 ? 0.018 : 0),
        blending: THREE.NormalBlending,
        depthTest: false,
        depthWrite: false
      })
    );
    const scale = radius * 2;
    cloud.scale.set(scale * elongation, scale * compression, 1);
    cloud.position.copy(vecFromNode(node)).add(new THREE.Vector3(gaussian(`${node.id}-cx-${index}`) * 160, gaussian(`${node.id}-cy-${index}`) * 110, -220 - index * 54));
    cloud.rotation.z = hashUnit(`${node.id}-cloud-rot`) * Math.PI;
    const driftRadius = 12 + hashUnit(`${node.id}-cloud-drift-${index}`) * 26;
    cloud.renderOrder = 0;
    cloud.userData = {
      baseScaleX: cloud.scale.x,
      baseScaleY: cloud.scale.y,
      baseX: cloud.position.x,
      baseY: cloud.position.y,
      baseZ: cloud.position.z,
      baseRotation: cloud.rotation.z,
      driftRadius,
      driftX: 0.45 + hashUnit(`${node.id}-cloud-drift-x-${index}`) * 0.45,
      driftY: 0.34 + hashUnit(`${node.id}-cloud-drift-y-${index}`) * 0.38,
      rotationSpeed: (hashUnit(`${node.id}-cloud-spin-${index}`) - 0.5) * 0.0018,
      phase: hashUnit(`${node.id}-cloud-phase`) * Math.PI * 2
    };
    cloudGroup.add(cloud);
  });

  return cloudGroup;
}

function createNetworkDust(input: CosmicDustInput, nodeMap: Map<string, NodePosition>) {
  const dustEdges = input.hasPath && input.highlightedPathEdges
    ? input.highlightedPathEdges
    : input.hasSelection
      ? input.visibleEdges.filter((edge) => edge.source === input.selectedNodeId || edge.target === input.selectedNodeId || edgeTouches(edge, input.activeIds))
      : input.visibleEdges;
  const sample = input.layout.length > 5000 ? 0.12 : input.layout.length > 1000 ? 0.35 : 1;
  const positions: number[] = [];
  const colors: number[] = [];
  let countTotal = 0;

  dustEdges.forEach((edge, edgeIndex) => {
    if (countTotal >= NETWORK_DUST_MAX) return;
    if (hashUnit(`${graphEdgeKey(edge)}-dust-sample`) > sample) return;
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return;

    const start = vecFromNode(source);
    const end = vecFromNode(target);
    const direction = end.clone().sub(start);
    const normal = new THREE.Vector3(-direction.y, direction.x, 0);
    if (normal.lengthSq() < 0.001) normal.set(1, 0, 0);
    normal.normalize();

    const weight = Math.max(1, edge.weight ?? 1);
    const count = Math.min(18, Math.max(2, Math.floor(2 + weight / 14)));
    const dustColor = new THREE.Color(edgeStyleForWeight(weight).color);

    for (let i = 0; i < count && countTotal < NETWORK_DUST_MAX; i += 1) {
      const seed = `${edgeIndex}-${i}-${graphEdgeKey(edge)}`;
      const t = hashUnit(`${seed}-t`);
      const offset = gaussian(`${seed}-offset`) * (10 + Math.min(26, weight * 0.22));
      const depth = gaussian(`${seed}-depth`) * 24;
      const pointOnEdge = start.clone().lerp(end, t).add(normal.clone().multiplyScalar(offset));
      pointOnEdge.z += depth;
      positions.push(pointOnEdge.x, pointOnEdge.y, pointOnEdge.z);
      colors.push(dustColor.r, dustColor.g, dustColor.b);
      countTotal += 1;
    }
  });

  if (!positions.length) return undefined;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const networkDust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: input.textures.dust,
      vertexColors: true,
      size: input.hasPath || input.hasSelection ? 2.4 : 2.05,
      transparent: true,
      opacity: input.hasPath || input.hasSelection ? 0.16 : 0.11,
      alphaTest: 0.015,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  networkDust.renderOrder = 1;
  return networkDust;
}

function createHubHaloDust(input: CosmicDustInput, rankedNodes: NodePosition[]) {
  const degree = new Map<string, number>();
  input.data.edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });

  const positions: number[] = [];
  const colors: number[] = [];
  let total = 0;
  const hubLimit = input.layout.length > 5000 ? 20 : input.layout.length > 1000 ? 50 : 80;

  rankedNodes.slice(0, hubLimit).forEach((node) => {
    if (total >= HUB_DUST_MAX) return;
    const nodeDegree = degree.get(node.id) ?? 0;
    if (nodeDegree < 3 && input.nodeTierIndex.get(node.id) !== 'core') return;
    const tierStyle = nodeStyleForTier(input.nodeTierIndex.get(node.id) ?? 'tertiary');
    const dustColor = new THREE.Color(tierStyle.glow);
    const count = Math.min(80, Math.max(18, 18 + nodeDegree * 4));
    const radiusBase = Math.min(140, 32 + (node.weight ?? 20) * 1.1 + nodeDegree * 2.2);

    for (let i = 0; i < count && total < HUB_DUST_MAX; i += 1) {
      const seed = `${node.id}-hub-${i}`;
      const angle = hashUnit(`${seed}-angle`) * Math.PI * 2;
      const radius = radiusBase * (0.45 + hashUnit(`${seed}-radius`) * 0.65);
      const eccentricity = 0.65 + hashUnit(`${seed}-ecc`) * 0.55;
      positions.push(node.x + Math.cos(angle) * radius, node.y + Math.sin(angle) * radius * eccentricity, node.z + gaussian(`${seed}-z`) * 26);
      colors.push(dustColor.r, dustColor.g, dustColor.b);
      total += 1;
    }
  });

  if (!positions.length) return undefined;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const hubDust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: input.textures.dust,
      vertexColors: true,
      size: input.hasPath || input.hasSelection ? 2.9 : 2.45,
      transparent: true,
      opacity: input.hasPath || input.hasSelection ? 0.2 : 0.16,
      alphaTest: 0.015,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  hubDust.renderOrder = 2;
  hubDust.userData.orbit = input.layout.length <= 1000;
  return hubDust;
}

export function createCosmicDustLayers(input: CosmicDustInput): CosmicDustLayers {
  const nodeMap = new Map(input.layout.map((node) => [node.id, node]));
  const rankedNodes = rankedLayoutNodes(input.data, nodeMap);
  const cloudGroup = createNebulaClouds(input.textures.clouds?.length ? input.textures.clouds : [input.textures.cloud]);
  const dustGroup = new THREE.Group();
  const networkDust = createNetworkDust(input, nodeMap);
  const hubDust = createHubHaloDust(input, rankedNodes);
  if (networkDust) dustGroup.add(networkDust);
  if (hubDust) dustGroup.add(hubDust);
  return { cloudGroup, dustGroup };
}

export function animateCosmicDust(layers: CosmicDustLayers, elapsed: number) {
  layers.dustGroup.children.forEach((child) => {
    if (child.userData.orbit) child.rotation.z += 0.00045;
  });
  layers.cloudGroup.children.forEach((child) => {
    if (!('baseScaleX' in child.userData)) return;
    const pulse = 1 + Math.sin(elapsed * 0.11 + child.userData.phase) * 0.008;
    child.scale.set(child.userData.baseScaleX * pulse, child.userData.baseScaleY * pulse, 1);
    const drift = child.userData.driftRadius ?? 0;
    child.position.set(
      child.userData.baseX + Math.sin(elapsed * 0.035 * child.userData.driftX + child.userData.phase) * drift,
      child.userData.baseY + Math.cos(elapsed * 0.031 * child.userData.driftY + child.userData.phase * 1.17) * drift * 0.62,
      child.userData.baseZ
    );
    child.rotation.z = child.userData.baseRotation + Math.sin(elapsed * 0.018 + child.userData.phase) * 0.035 + elapsed * child.userData.rotationSpeed;
  });
}
