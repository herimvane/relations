import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GraphData, GraphNode, GraphPath, GraphViewCommand, NodePosition } from '../types/graph';
import { animateCosmicDust, createCosmicDustLayers } from './cosmicDust';
import { createForceLayout } from './createForceLayout';
import { rankCoreNodes } from './coreScore';
import { buildNodeTierIndex, edgeStyleForWeight, nebulaTheme, nodeStyleForTier } from './graphTheme';
import { edgeTouches, neighborIds } from './graphInteractions';

type Props = {
  data: GraphData;
  selectedNodeId?: string;
  focusedNodeId?: string;
  highlightedPath?: GraphPath;
  viewCommand?: GraphViewCommand;
  relationTypes: string[];
  minWeight: number;
  onSelectNode: (node: GraphNode) => void;
  onHoverNode: (node?: GraphNode) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
};

type NodeMesh = THREE.Mesh & { userData: { node: NodePosition } };
type ViewState = {
  rootPosition: THREE.Vector3;
  rootRotation: THREE.Euler;
  rootScale: number;
  cameraZ: number;
  dataSignature: string;
};

type FitView = {
  center: THREE.Vector3;
  cameraZ: number;
};

type FocusTarget = {
  id: string;
  center: THREE.Vector3;
  cameraZ: number;
  rotation: THREE.Euler;
  active: boolean;
};

type GraphRuntime = {
  root: THREE.Group;
  camera: THREE.PerspectiveCamera;
  cameraFov: number;
  nodeMap: Map<string, NodePosition>;
  layout: NodePosition[];
};

const DEFAULT_ROOT_ROTATION = new THREE.Euler(-0.32, 0.38, -0.04);
const COMMUNITY_ROOT_ROTATION = new THREE.Euler(-0.48, 0.66, -0.06);
const LARGE_GRAPH_NODE_THRESHOLD = 2500;
const LARGE_GRAPH_EDGE_LIMIT = 1800;
const LARGE_GRAPH_FOCUS_EDGE_LIMIT = 120;
const LARGE_GRAPH_ANIMATED_EDGE_LIMIT = 72;
const LARGE_GRAPH_FOCUS_ANIMATED_EDGE_LIMIT = 24;
const MIN_CAMERA_Z = 240;
const MAX_CAMERA_Z = 2750;
const CAMERA_Y_OFFSET = 24;
const ZOOM_IN_FACTOR = 0.84;
const ZOOM_OUT_FACTOR = 1.18;
let cachedNebulaCloudTextures: THREE.CanvasTexture[] | undefined;

function makeHitMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    colorWrite: false
  });
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(245,250,255,0.92)');
  gradient.addColorStop(0.42, 'rgba(160,220,255,0.34)');
  gradient.addColorStop(0.72, 'rgba(95,150,255,0.12)');
  gradient.addColorStop(1, 'rgba(160,220,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeDustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.46)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function seededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967295;
  };
}

function makeNebulaCloudTexture(seed = Math.random().toString(36).slice(2)) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const size = 256;
  const random = seededRandom(seed);
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < 18; i += 1) {
    const x = size * (0.22 + random() * 0.56);
    const y = size * (0.24 + random() * 0.52);
    const radius = size * (0.09 + random() * 0.2);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.03 + random() * 0.08;
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.46, `rgba(255,255,255,${alpha * 0.48})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.scale(1.1 + random() * 2.2, 0.35 + random() * 0.5);
    ctx.translate(-x, -y);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5; i += 1) {
    const y = size * (0.28 + random() * 0.44);
    const gradient = ctx.createLinearGradient(0, y - 18, size, y + 18);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, `rgba(0,0,0,${0.12 + random() * 0.18})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((random() - 0.5) * 1.1);
    ctx.translate(-size / 2, -size / 2);
    ctx.fillStyle = gradient;
    ctx.fillRect(-size * 0.15, y - 24, size * 1.3, 48);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'blur(6px)';
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getNebulaCloudTextures() {
  cachedNebulaCloudTextures ??= Array.from({ length: 4 }, (_, index) => makeNebulaCloudTexture(`nebula-${index}-${Math.random()}`));
  return cachedNebulaCloudTextures;
}

function makeStarburstTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 192, 192);

  const center = 96;
  const radial = ctx.createRadialGradient(center, center, 0, center, center, 46);
  radial.addColorStop(0, 'rgba(255,255,255,0.86)');
  radial.addColorStop(0.16, 'rgba(235,248,255,0.28)');
  radial.addColorStop(0.54, 'rgba(130,200,255,0.06)');
  radial.addColorStop(1, 'rgba(130,200,255,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 192, 192);

  const drawRay = (angle: number, length: number, width: number, alpha: number) => {
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.34, `rgba(180,225,255,${alpha * 0.38})`);
    gradient.addColorStop(1, 'rgba(180,225,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.quadraticCurveTo(length * 0.42, -width * 0.44, length, 0);
    ctx.quadraticCurveTo(length * 0.42, width * 0.44, 0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  for (let i = 0; i < 16; i += 1) {
    const major = i % 4 === 0;
    const angle = (Math.PI * 2 * i) / 16;
    drawRay(angle, major ? 52 : 34, major ? 2.4 : 1.25, major ? 0.34 : 0.16);
  }

  return new THREE.CanvasTexture(canvas);
}

function makeStarCoreTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.34, 'rgba(235,248,255,0.58)');
  gradient.addColorStop(0.55, 'rgba(165,215,255,0.16)');
  gradient.addColorStop(0.76, 'rgba(95,160,255,0.035)');
  gradient.addColorStop(1, 'rgba(170,215,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const ring = ctx.createRadialGradient(64, 64, 18, 64, 64, 48);
  ring.addColorStop(0, 'rgba(255,255,255,0)');
  ring.addColorStop(0.42, 'rgba(255,255,255,0.11)');
  ring.addColorStop(0.62, 'rgba(255,255,255,0.04)');
  ring.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function makeHotCoreTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.48, 'rgba(250,253,255,0.44)');
  gradient.addColorStop(0.72, 'rgba(250,253,255,0.08)');
  gradient.addColorStop(1, 'rgba(250,253,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

function makeRippleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 192, 192);
  const center = 96;
  const ring = ctx.createRadialGradient(center, center, 44, center, center, 92);
  ring.addColorStop(0, 'rgba(190,235,255,0)');
  ring.addColorStop(0.42, 'rgba(190,235,255,0.006)');
  ring.addColorStop(0.6, 'rgba(190,235,255,0.18)');
  ring.addColorStop(0.7, 'rgba(255,242,168,0.05)');
  ring.addColorStop(0.84, 'rgba(190,235,255,0.018)');
  ring.addColorStop(1, 'rgba(190,235,255,0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, 192, 192);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeCommunityRegionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.globalCompositeOperation = 'lighter';

  const drawDisk = (alpha: number, scaleX: number, scaleY: number, offsetX = 0, offsetY = 0) => {
    const gradient = ctx.createRadialGradient(cx + offsetX, cy + offsetY, 0, cx + offsetX, cy + offsetY, 106);
    gradient.addColorStop(0, `rgba(255,255,245,${alpha * 0.96})`);
    gradient.addColorStop(0.15, `rgba(225,240,255,${alpha * 0.58})`);
    gradient.addColorStop(0.42, `rgba(158,196,218,${alpha * 0.24})`);
    gradient.addColorStop(0.72, `rgba(116,145,150,${alpha * 0.09})`);
    gradient.addColorStop(1, 'rgba(116,145,150,0)');
    ctx.save();
    ctx.translate(cx + offsetX, cy + offsetY);
    ctx.rotate(-0.42);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-(cx + offsetX), -(cy + offsetY));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx + offsetX, cy + offsetY, 96, 58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  ctx.filter = 'blur(8px)';
  drawDisk(0.23, 1.44, 0.5);
  drawDisk(0.16, 1.18, 0.42, -12, 8);
  drawDisk(0.1, 1.64, 0.36, 18, -8);

  ctx.filter = 'blur(3px)';
  for (let lane = 0; lane < 4; lane += 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(cx, cy);
    ctx.rotate(-0.48 + lane * 0.06);
    ctx.scale(1.54, 0.42);
    ctx.translate(-cx, -cy);
    const y = cy + (lane - 1.4) * 16;
    const laneGradient = ctx.createLinearGradient(cx - 112, y, cx + 112, y + 18);
    laneGradient.addColorStop(0, 'rgba(0,0,0,0)');
    laneGradient.addColorStop(0.42, `rgba(0,0,0,${0.12 + lane * 0.035})`);
    laneGradient.addColorStop(0.66, `rgba(0,0,0,${0.18 + lane * 0.028})`);
    laneGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = laneGradient;
    ctx.fillRect(cx - 120, y - 7, 240, 14);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(1px)';
  const core = ctx.createRadialGradient(cx - 7, cy + 4, 0, cx - 7, cy + 4, 30);
  core.addColorStop(0, 'rgba(255,255,246,0.72)');
  core.addColorStop(0.22, 'rgba(255,244,214,0.42)');
  core.addColorStop(0.58, 'rgba(178,220,255,0.16)');
  core.addColorStop(1, 'rgba(178,220,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(cx - 38, cy - 34, 76, 76);

  ctx.filter = 'none';

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeNodeLabelTexture(name: string) {
  const text = Array.from(name).slice(0, 5).join('');
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.font = '600 24px Inter, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(80,190,255,0.86)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(4,9,16,0.78)';
  ctx.lineWidth = 4;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 1);
  ctx.fillStyle = '#f9fafb';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeCommunityLabelTexture(name: string, count: unknown) {
  const title = Array.from(name.replace(/^社交关系大图\s*|^企业\/风控关系图\s*/g, '')).slice(0, 6).join('');
  const subtitle = `${Number(count ?? 0).toLocaleString()} nodes`;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 78;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(11,16,32,0.92)';
  ctx.shadowBlur = 14;
  ctx.font = '700 21px Inter, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(249,250,251,0.92)';
  ctx.fillText(title, canvas.width / 2, 30);
  ctx.font = '500 14px Inter, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(191,201,217,0.72)';
  ctx.fillText(subtitle, canvas.width / 2, 55);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function vecFromNode(node: NodePosition) {
  return new THREE.Vector3(node.x, node.y, node.z);
}

function isCommunityNode(node: GraphNode) {
  return node.type === '社区' || node.id.startsWith('community:');
}

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

function graphEdgeKey(edge: { id?: string; source: string; target: string; relation_type: string }) {
  return edge.id ?? `${edge.source}-${edge.target}-${edge.relation_type}`;
}

function graphEdgeSignatures(edge: { id?: string; source: string; target: string; relation_type: string }) {
  const relation = edge.relation_type || '';
  const directional = `${edge.source}->${edge.target}::${relation}`;
  const reverse = `${edge.target}->${edge.source}::${relation}`;
  const unordered = [edge.source, edge.target].sort().join('<->') + `::${relation}`;
  return [edge.id, directional, reverse, unordered].filter((item): item is string => Boolean(item));
}

function edgeSignatureSet(edges?: { id?: string; source: string; target: string; relation_type: string }[]) {
  const signatures = new Set<string>();
  edges?.forEach((edge) => {
    graphEdgeSignatures(edge).forEach((signature) => signatures.add(signature));
  });
  return signatures;
}

function edgeMatchesSignatures(edge: { id?: string; source: string; target: string; relation_type: string }, signatures: Set<string>) {
  return graphEdgeSignatures(edge).some((signature) => signatures.has(signature));
}

function midpointCurve(
  source: NodePosition,
  target: NodePosition,
  options: { key: string; weight?: number; active?: boolean; lift?: number }
) {
  const start = vecFromNode(source);
  const end = vecFromNode(target);
  const mid = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const distance = start.distanceTo(end);

  const seed = `${options.key}-${source.id}-${target.id}`;
  const distanceFactor = THREE.MathUtils.clamp(distance / 430, 0.36, 1.34);
  const weightFactor = THREE.MathUtils.clamp(1.15 - (options.weight ?? 30) / 180, 0.62, 1.08);
  const focusFactor = options.active ? 0.72 : 1;
  const lift = options.lift ?? 1;

  const directionNormal = direction.clone().normalize();
  const randomVector = new THREE.Vector3(
    hashUnit(`${seed}-bend-x`) * 2 - 1,
    hashUnit(`${seed}-bend-y`) * 2 - 1,
    (hashUnit(`${seed}-bend-z`) * 2 - 1) * 1.35
  );
  randomVector.sub(directionNormal.clone().multiplyScalar(randomVector.dot(directionNormal)));
  if (randomVector.lengthSq() < 0.0001) {
    randomVector.crossVectors(directionNormal, new THREE.Vector3(0, 0, 1));
  }
  if (randomVector.lengthSq() < 0.0001) {
    randomVector.crossVectors(directionNormal, new THREE.Vector3(0, 1, 0));
  }
  randomVector.normalize();

  const radialVector = mid.clone();
  if (radialVector.lengthSq() > 0.0001) {
    radialVector.normalize();
    radialVector.sub(directionNormal.clone().multiplyScalar(radialVector.dot(directionNormal)));
    if (radialVector.lengthSq() > 0.0001) {
      radialVector.normalize();
      randomVector.lerp(radialVector, 0.22 + hashUnit(`${seed}-radial-mix`) * 0.18).normalize();
    }
  }

  const bendAmount = (22 + distance * 0.18) * distanceFactor * weightFactor * focusFactor * lift;
  mid.add(randomVector.multiplyScalar(bendAmount));

  return new THREE.CatmullRomCurve3([start, mid, end]);
}

function createFitView(
  nodes: NodePosition[],
  rotation: THREE.Euler,
  aspect: number,
  fov: number,
  scale: number,
  padding = 1.4,
  minFrame = 460,
  minCameraZ = 320,
  maxCameraZ = MAX_CAMERA_Z
): FitView {
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(), cameraZ: 720 };
  }

  const points = nodes.map((node) => vecFromNode(node).applyEuler(rotation).multiplyScalar(scale));
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const spriteMargin = Math.max(28, Math.min(88, padding * 36));
  const vertical = Math.max(size.y + spriteMargin, (size.x + spriteMargin) / Math.max(aspect, 0.1), minFrame);
  const fovRadians = THREE.MathUtils.degToRad(fov);
  const distance = (vertical * padding) / (2 * Math.tan(fovRadians / 2));
  const depthAllowance = Math.max(0, size.z * 0.5);
  return {
    center,
    cameraZ: THREE.MathUtils.clamp(distance + depthAllowance, minCameraZ, maxCameraZ)
  };
}

function overviewPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(1.08 + nodeCount / 2600, 1.1, 1.28);
}

function focusPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(1.14 + nodeCount / 620, 1.18, 1.4);
}

type FitChoice = FitView & {
  rotation: THREE.Euler;
  score: number;
};

type AutoFrameOptions = {
  padding: number;
  minFrame: number;
  minCameraZ: number;
  maxCameraZ?: number;
  preferDepth?: number;
  rotationDamping?: number;
};

function rotationCandidates(currentRotation: THREE.Euler) {
  const baseY = currentRotation.y;
  const candidates: THREE.Euler[] = [];
  const xAngles = [-0.62, -0.52, -0.42, -0.32, -0.22, -0.12, 0.02];
  const yAngles = [
    baseY - 1.08,
    baseY - 0.78,
    baseY - 0.52,
    baseY - 0.28,
    baseY,
    baseY + 0.28,
    baseY + 0.52,
    baseY + 0.78,
    baseY + 1.08,
    0,
    0.42,
    -0.42,
    0.78,
    -0.78
  ];
  const zAngles = [-0.1, -0.04, 0, 0.04, 0.1];

  xAngles.forEach((x) => {
    yAngles.forEach((y) => {
      zAngles.forEach((z) => candidates.push(new THREE.Euler(x, y, z)));
    });
  });
  candidates.push(currentRotation.clone());
  return candidates;
}

function rotationDistance(a: THREE.Euler, b: THREE.Euler) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 0.7 + Math.abs(a.z - b.z) * 0.42;
}

function fitScore(nodes: NodePosition[], rotation: THREE.Euler, fit: FitView, aspect: number, scale: number, currentRotation: THREE.Euler, options: AutoFrameOptions) {
  const points = nodes.map((node) => vecFromNode(node).applyEuler(rotation).multiplyScalar(scale));
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x, 1);
  const height = Math.max(size.y, 1);
  const depth = Math.max(size.z, 1);
  const frame = Math.max(width / Math.max(aspect, 0.1), height, options.minFrame);
  const projectedAspect = Math.max(width / Math.max(aspect, 0.1), height) / Math.max(1, Math.min(width / Math.max(aspect, 0.1), height));
  const aspectPenalty = Math.abs(Math.log(projectedAspect)) * 120;
  const flatnessPenalty = depth < frame * 0.18 ? (frame * 0.18 - depth) * 0.34 : 0;
  const depthReward = Math.min(depth, frame * 1.35) * (options.preferDepth ?? 0.12);
  const rotationPenalty = rotationDistance(rotation, currentRotation) * (options.rotationDamping ?? 18);
  return fit.cameraZ + aspectPenalty + flatnessPenalty + rotationPenalty - depthReward;
}

function chooseAutoFrameView(
  nodes: NodePosition[],
  currentRotation: THREE.Euler,
  aspect: number,
  fov: number,
  scale: number,
  options: AutoFrameOptions
): FitChoice {
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(), cameraZ: 720, rotation: currentRotation.clone(), score: 0 };
  }

  const candidates = nodes.length < 3 ? [currentRotation.clone(), DEFAULT_ROOT_ROTATION.clone()] : rotationCandidates(currentRotation);
  return candidates.reduce<FitChoice | undefined>((best, rotation) => {
    const fit = createFitView(nodes, rotation, aspect, fov, scale, options.padding, options.minFrame, options.minCameraZ, options.maxCameraZ ?? MAX_CAMERA_Z);
    const choice = { ...fit, rotation, score: fitScore(nodes, rotation, fit, aspect, scale, currentRotation, options) };
    if (!best) return choice;
    return choice.score < best.score ? choice : best;
  }, undefined)!;
}

const chooseBestFitView = chooseAutoFrameView;

function graphDataSignature(data: GraphData) {
  const firstNode = data.nodes[0]?.id ?? '';
  const lastNode = data.nodes[data.nodes.length - 1]?.id ?? '';
  const firstEdge = data.edges[0]?.id ?? `${data.edges[0]?.source ?? ''}:${data.edges[0]?.target ?? ''}`;
  return `${data.nodes.length}:${data.edges.length}:${firstNode}:${lastNode}:${firstEdge}`;
}

function representativeOverviewNodes(nodes: NodePosition[], edges: GraphData['edges']) {
  if (nodes.length <= 1200) return nodes;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const ranked = rankCoreNodes({ nodes, edges })
    .map((item) => nodeMap.get(item.node.id))
    .filter((node): node is NodePosition => Boolean(node))
    .slice(0, 420);
  const extremes = [
    [...nodes].sort((a, b) => a.x - b.x).slice(0, 28),
    [...nodes].sort((a, b) => b.x - a.x).slice(0, 28),
    [...nodes].sort((a, b) => a.y - b.y).slice(0, 28),
    [...nodes].sort((a, b) => b.y - a.y).slice(0, 28),
    [...nodes].sort((a, b) => a.z - b.z).slice(0, 28),
    [...nodes].sort((a, b) => b.z - a.z).slice(0, 28)
  ].flat();
  return Array.from(new Map([...ranked, ...extremes].map((node) => [node.id, node])).values());
}

function isCommunityView(data: GraphData) {
  return data.nodes.length > 0 && data.nodes.every(isCommunityNode);
}

export function NebulaGraph({
  data,
  selectedNodeId,
  focusedNodeId,
  highlightedPath,
  viewCommand,
  relationTypes,
  minWeight,
  onSelectNode,
  onHoverNode,
  onCanvasReady
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedNodeId);
  const focusedRef = useRef(focusedNodeId);
  const viewStateRef = useRef<ViewState>();
  const focusTargetRef = useRef<FocusTarget>();
  const runtimeRef = useRef<GraphRuntime>();
  const viewCommandRef = useRef(viewCommand);
  const visibleRelations = useMemo(() => new Set(relationTypes), [relationTypes]);
  const layout = useMemo(() => createForceLayout(data), [data]);
  const nodeTierIndex = useMemo(() => buildNodeTierIndex(data), [data]);
  const communityView = useMemo(() => isCommunityView(data), [data]);
  const dataSignature = useMemo(() => graphDataSignature(data), [data]);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    focusedRef.current = focusedNodeId;
  }, [selectedNodeId, focusedNodeId]);

  useEffect(() => {
    viewCommandRef.current = viewCommand;
  }, [viewCommand]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const pathNodeIds = new Set(highlightedPath?.nodes.map((node) => node.id) ?? []);
    if (pathNodeIds.size > 0) {
      const pathNodes = Array.from(pathNodeIds)
        .map((id) => runtime.nodeMap.get(id))
        .filter((node): node is NodePosition => Boolean(node));
      const focusFit = chooseBestFitView(
        pathNodes,
        runtime.root.rotation,
        runtime.camera.aspect,
        runtime.cameraFov,
        runtime.root.scale.x,
        {
          padding: Math.max(1.22, focusPadding(pathNodes.length)),
          minFrame: 520,
          minCameraZ: communityView ? 620 : 640,
          maxCameraZ: communityView ? 1320 : MAX_CAMERA_Z,
          preferDepth: 0.18,
          rotationDamping: 9
        }
      );
      focusTargetRef.current = {
        id: `path-${highlightedPath?.id}`,
        center: focusFit.center,
        cameraZ: focusFit.cameraZ,
        rotation: focusFit.rotation,
        active: true
      };
      return;
    }

    if (!focusedNodeId) {
      focusTargetRef.current = undefined;
      return;
    }

    const activeIds = neighborIds(data, selectedNodeId, 1);
    if (!activeIds.has(focusedNodeId)) activeIds.add(focusedNodeId);
    const focusNodes = Array.from(activeIds)
      .map((id) => runtime.nodeMap.get(id))
      .filter((node): node is NodePosition => Boolean(node));
    const focusFit = chooseBestFitView(
      focusNodes,
      runtime.root.rotation,
      runtime.camera.aspect,
      runtime.cameraFov,
      runtime.root.scale.x,
      {
        padding: focusPadding(focusNodes.length),
        minFrame: 560,
        minCameraZ: communityView ? 620 : 660,
        maxCameraZ: communityView ? 1320 : MAX_CAMERA_Z,
        preferDepth: communityView ? 0.18 : 0.13,
        rotationDamping: 10
      }
    );
    focusTargetRef.current = {
      id: focusedNodeId,
      center: focusFit.center,
      cameraZ: focusFit.cameraZ,
      rotation: focusFit.rotation,
      active: true
    };
  }, [communityView, data, focusedNodeId, highlightedPath, selectedNodeId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(nebulaTheme.background.fog, 0.00072);

    const cameraFov = communityView ? 53 : 48;
    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 4200);
    const savedView = viewStateRef.current?.dataSignature === dataSignature ? viewStateRef.current : undefined;
    camera.position.set(0, CAMERA_Y_OFFSET, savedView?.cameraZ ?? (communityView ? 780 : 720));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(new THREE.Color(nebulaTheme.background.canvas), 0);
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const root = new THREE.Group();
    root.position.copy(savedView?.rootPosition ?? new THREE.Vector3(0, 0, 0));
    root.rotation.copy(savedView?.rootRotation ?? (communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION));
    root.scale.setScalar(savedView?.rootScale ?? (communityView ? 0.86 : 0.88));
    scene.add(root);

    if (!savedView) {
      const initialFit = chooseAutoFrameView(
        representativeOverviewNodes(layout, data.edges),
        communityView ? COMMUNITY_ROOT_ROTATION : root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          padding: overviewPadding(layout.length),
          minFrame: communityView ? 400 : 360,
          minCameraZ: communityView ? 520 : 500,
          maxCameraZ: communityView ? 1380 : MAX_CAMERA_Z,
          preferDepth: communityView ? 0.16 : 0.11,
          rotationDamping: 6
        }
      );
      root.rotation.copy(initialFit.rotation);
      root.position.set(-initialFit.center.x, -initialFit.center.y, -initialFit.center.z * (communityView ? 0.3 : 0.18));
      const introCameraZ = Math.min(MAX_CAMERA_Z, Math.max(initialFit.cameraZ + 42, initialFit.cameraZ * 1.16));
      camera.position.z = introCameraZ;
      focusTargetRef.current = {
        id: `initial-${dataSignature}`,
        center: initialFit.center,
        cameraZ: initialFit.cameraZ,
        rotation: initialFit.rotation,
        active: true
      };
    }

    const ambient = new THREE.AmbientLight(0xbfc9d9, 0.74);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffe8d6, 2.2, 1400);
    point.position.set(0, -80, 360);
    scene.add(point);
    const rim = new THREE.PointLight(0x65d6ff, 0.72, 1800);
    rim.position.set(-420, 280, 520);
    scene.add(rim);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 520 + Math.random() * 1320;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(p) * Math.cos(t);
      starPositions[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      starPositions[i * 3 + 2] = r * Math.cos(p) - 260;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const glowTexture = makeGlowTexture();
    const dustTexture = makeDustTexture();
    const nebulaCloudTextures = getNebulaCloudTextures();
    const starburstTexture = makeStarburstTexture();
    const starCoreTexture = makeStarCoreTexture();
    const hotCoreTexture = makeHotCoreTexture();
    const rippleTexture = makeRippleTexture();
    const communityRegionTexture = makeCommunityRegionTexture();
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        map: dustTexture,
        color: 0xffffff,
        size: 2.3,
        transparent: true,
        opacity: 0.18,
        alphaTest: 0.02,
        depthWrite: false
      })
    );
    scene.add(stars);
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 1200;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const r = 760 + Math.random() * 1320;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      dustPositions[i * 3] = r * Math.sin(p) * Math.cos(t);
      dustPositions[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      dustPositions[i * 3 + 2] = r * Math.cos(p) - 420;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: dustTexture,
        color: nebulaTheme.background.dust,
        size: 2.1,
        transparent: true,
        opacity: 0.08,
        alphaTest: 0.015,
        depthWrite: false
      })
    );
    scene.add(dust);

    const nodeMap = new Map(layout.map((node) => [node.id, node]));
    runtimeRef.current = {
      root,
      camera,
      cameraFov,
      nodeMap,
      layout
    };
    const activeIds = neighborIds(data, selectedNodeId, 1);
    const hoverIds = new Set<string>();
    const hasSelection = Boolean(selectedNodeId);
    const hasHover = false;
    const pathEdgeKeys = edgeSignatureSet(highlightedPath?.edges);
    const pathNodeIds = new Set(highlightedPath?.nodes.map((node) => node.id) ?? []);
    const hasPath = pathEdgeKeys.size > 0;
    const edgeOpacity = (active: boolean) => (hasPath ? (active ? 1 : 0.05) : hasSelection ? (active ? 1 : 0.05) : 0.22);
    const particleOpacity = (active: boolean) => (hasPath ? (active ? 0.88 : 0.16) : hasSelection ? (active ? 0.72 : 0.2) : 0.42);
    const trailOpacity = (active: boolean) => (hasPath ? (active ? 0.16 : 0.055) : active ? 0.12 : 0.05);
    const largeGraph = layout.length > LARGE_GRAPH_NODE_THRESHOLD;
    const nodeMeshes: NodeMesh[] = [];
    const raycastTargets: THREE.Object3D[] = [];

    const filteredEdges = data.edges.filter((edge) => visibleRelations.has(edge.relation_type) && (edge.weight ?? 0) >= minWeight);
    const focusEdges =
      largeGraph && selectedNodeId
        ? filteredEdges
            .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
            .slice(0, LARGE_GRAPH_FOCUS_EDGE_LIMIT)
        : [];
    const focusEdgeRefs = new WeakSet<GraphData['edges'][number]>(focusEdges);
    const focusDetailIds = new Set<string>(selectedNodeId ? [selectedNodeId] : []);
    focusEdges.forEach((edge) => {
      focusDetailIds.add(edge.source);
      focusDetailIds.add(edge.target);
    });
    pathNodeIds.forEach((id) => focusDetailIds.add(id));
    const communityEdgeCounts = new Map<string, number>();
    data.edges.forEach((edge) => {
      const count = Number(edge.properties?.edge_count ?? edge.weight ?? 1);
      communityEdgeCounts.set(edge.source, (communityEdgeCounts.get(edge.source) ?? 0) + count);
      communityEdgeCounts.set(edge.target, (communityEdgeCounts.get(edge.target) ?? 0) + count);
    });

    const visibleEdges = largeGraph
      ? hasSelection
        ? [
            ...focusEdges,
            ...filteredEdges
              .filter((edge) => !focusEdgeRefs.has(edge))
              .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
              .slice(0, Math.max(0, LARGE_GRAPH_EDGE_LIMIT - focusEdges.length))
          ]
        : filteredEdges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, LARGE_GRAPH_EDGE_LIMIT)
      : filteredEdges;

    if (hasPath) {
      const pathNodes = Array.from(pathNodeIds)
        .map((id) => nodeMap.get(id))
        .filter((node): node is NodePosition => Boolean(node));
      const focusFit = chooseBestFitView(
        pathNodes,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          padding: Math.max(1.08, focusPadding(pathNodes.length)),
          minFrame: communityView ? 400 : 380,
          minCameraZ: communityView ? 500 : 500,
          maxCameraZ: communityView ? 1320 : MAX_CAMERA_Z,
          preferDepth: 0.18,
          rotationDamping: 9
        }
      );
      focusTargetRef.current = {
        id: `path-${highlightedPath?.id}`,
        center: focusFit.center,
        cameraZ: focusFit.cameraZ,
        rotation: focusFit.rotation,
        active: true
      };
    } else if (focusedNodeId) {
      const focusNodes = Array.from(activeIds)
        .map((id) => nodeMap.get(id))
        .filter((node): node is NodePosition => Boolean(node));
      const focusFit = chooseBestFitView(
        focusNodes,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          padding: focusPadding(focusNodes.length),
          minFrame: communityView ? 420 : 400,
          minCameraZ: communityView ? 500 : 520,
          maxCameraZ: communityView ? 1320 : MAX_CAMERA_Z,
          preferDepth: communityView ? 0.18 : 0.13,
          rotationDamping: 10
        }
      );
      focusTargetRef.current = {
        id: focusedNodeId,
        center: focusFit.center,
        cameraZ: focusFit.cameraZ,
        rotation: focusFit.rotation,
        active: true
      };
    } else {
      focusTargetRef.current = undefined;
    }

    const cloudLayer = new THREE.Group();
    cloudLayer.position.set(0, 0, 0);
    cloudLayer.scale.setScalar(0.88);
    scene.add(cloudLayer);
    const dustGroup = new THREE.Group();
    const edgeGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    root.add(dustGroup, edgeGroup, particleGroup, nodeGroup);

    const largeActiveLinePositions: number[] = [];
    const largeActiveLineColors: number[] = [];
    const largeMutedLinePositions: number[] = [];
    const largeMutedLineColors: number[] = [];

    const appendLargeCurveSegments = (curve: THREE.CatmullRomCurve3, color: THREE.Color, isActive: boolean) => {
      const points = curve.getPoints(16);
      const positions = isActive ? largeActiveLinePositions : largeMutedLinePositions;
      const colors = isActive ? largeActiveLineColors : largeMutedLineColors;
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    };

    const addMergedLines = (positions: number[], colors: number[], opacity: number, renderOrder: number) => {
      if (positions.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.renderOrder = renderOrder;
      edgeGroup.add(lines);
    };

    const cosmicDust = createCosmicDustLayers({
      data,
      layout,
      visibleEdges,
      highlightedPathEdges: highlightedPath?.edges,
      selectedNodeId,
      activeIds,
      nodeTierIndex,
      hasPath,
      hasSelection,
      textures: {
        dust: dustTexture,
        cloud: nebulaCloudTextures[0],
        clouds: nebulaCloudTextures
      }
    });
    cloudLayer.add(cosmicDust.cloudGroup);
    dustGroup.add(cosmicDust.dustGroup);

    let animatedEdgeCount = 0;
    visibleEdges.forEach((edge, edgeIndex) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) {
        console.warn('[NebulaGraph] Edge skipped because endpoint node is missing', edge);
        return;
      }
      const edgeStyle = edgeStyleForWeight(edge.weight ?? 1);
      const baseColor = new THREE.Color(edgeStyle.color);
      const aggregateEdgeCount = Number(edge.properties?.edge_count ?? 0);
      const isAggregateCommunityEdge = edge.relation_type === '跨社区关系';
      const key = `${graphEdgeKey(edge)}-${edgeIndex}`;
      const isPathEdge = edgeMatchesSignatures(edge, pathEdgeKeys);
      if (hasPath && isPathEdge) return;
      const analysisColor = new THREE.Color(nebulaTheme.path.line);
      const pathParticleColor = new THREE.Color(nebulaTheme.path.particle);
      const isActive = hasPath
        ? isPathEdge
        : hasHover
          ? edgeTouches(edge, hoverIds)
        : largeGraph && hasSelection
          ? focusEdgeRefs.has(edge)
          : !hasSelection || edgeTouches(edge, activeIds);
      const color = hasPath && isPathEdge ? pathParticleColor : baseColor;
      const aggregateStrength = THREE.MathUtils.clamp(Math.log1p(aggregateEdgeCount) / 4.4, 0, 1);
      const aggregateColor = new THREE.Color('#65D6FF').lerp(new THREE.Color('#FFD54F'), aggregateStrength * 0.58);
      const focusedAggregateColor =
        isAggregateCommunityEdge && isActive && (hasSelection || hasPath)
          ? aggregateColor.clone().lerp(new THREE.Color('#FFE8D6'), 0.42)
          : aggregateColor;
      const lineColor = hasPath && isPathEdge
        ? analysisColor
        : hasPath
          ? baseColor.clone().lerp(new THREE.Color(0x475569), 0.5)
          : isAggregateCommunityEdge
            ? focusedAggregateColor
            : baseColor;
      const aggregateOpacity = isAggregateCommunityEdge
        ? hasPath || hasSelection
          ? isActive
            ? 0.64 + aggregateStrength * 0.28
            : 0.024
        : hasHover
          ? isActive
            ? 0.48 + aggregateStrength * 0.24
            : 0.026
          : 0.07 + aggregateStrength * 0.13
        : Math.min(edgeOpacity(isActive), edgeStyle.opacity + (isActive ? 0.2 : 0));
      const material = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: hasPath && isPathEdge ? edgeOpacity(isActive) : aggregateOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const curve = midpointCurve(source, target, {
        key,
        weight: edge.weight,
        active: isActive,
        lift: isActive ? 0.92 : 1.08
      });
      if (largeGraph) {
        appendLargeCurveSegments(curve, lineColor, isActive);
      } else {
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
        const line = new THREE.Line(geometry, material);
        line.renderOrder = isActive ? 2 : 1;
        edgeGroup.add(line);
      }

        const animationLimit = hasPath ? 36 : hasSelection ? LARGE_GRAPH_FOCUS_ANIMATED_EDGE_LIMIT : LARGE_GRAPH_ANIMATED_EDGE_LIMIT;
        const shouldAnimate =
          (isActive || (!hasSelection && !hasPath && (edge.weight ?? 0) >= 78)) && animatedEdgeCount < animationLimit;
        if (shouldAnimate) {
          animatedEdgeCount += 1;
          const progress = Math.random();
          const speed = 0.0022 + (edge.weight ?? 20) / 78000;
          const particleMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            transparent: true,
            opacity: particleOpacity(isActive),
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const particle = new THREE.Sprite(particleMaterial);
          particle.scale.set(isActive ? 6.8 : 4.8, isActive ? 6.8 : 4.8, 1);
          particle.renderOrder = isActive ? 5 : 4;
          particle.userData = {
            curve,
            progress,
            speed
          };
          particleGroup.add(particle);

          for (let trailIndex = 1; trailIndex <= 3; trailIndex += 1) {
            const trail = new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: glowTexture,
                color,
                transparent: true,
                opacity: trailOpacity(isActive) / trailIndex,
                blending: THREE.AdditiveBlending,
                depthWrite: false
              })
            );
            const trailSize = (isActive ? 4.9 : 3.2) / Math.sqrt(trailIndex);
            trail.scale.set(trailSize, trailSize, 1);
            trail.renderOrder = isActive ? 4 : 3;
            trail.userData = {
              curve,
              progress: (progress - trailIndex * 0.024 + 1) % 1,
              speed,
              trailing: trailIndex
            };
            particleGroup.add(trail);
          }
        }
      });

    if (largeGraph) {
      addMergedLines(largeMutedLinePositions, largeMutedLineColors, hasPath || hasSelection ? 0.05 : 0.13, 1);
      addMergedLines(largeActiveLinePositions, largeActiveLineColors, hasPath || hasSelection ? 1 : 0.22, 2);
    }

    if (hasPath && highlightedPath) {
      const pathLineColor = new THREE.Color(nebulaTheme.path.line);
      const pathParticleColor = new THREE.Color(nebulaTheme.path.particle);
      highlightedPath.edges.forEach((edge, index) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;

        const curve = midpointCurve(source, target, {
          key: `path-overlay-${index}-${graphEdgeKey(edge)}`,
          weight: Math.max(edge.weight ?? 50, 86),
          active: true,
          lift: 0.82
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(72));
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: pathLineColor,
            transparent: true,
            opacity: 0.96,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          })
        );
        line.renderOrder = 9;
        edgeGroup.add(line);

        const progress = (index * 0.19 + Math.random() * 0.18) % 1;
        const speed = 0.0032 + (edge.weight ?? 40) / 90000;
        const particle = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: pathParticleColor,
            transparent: true,
            opacity: 0.94,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          })
        );
        particle.scale.set(7.2, 7.2, 1);
        particle.renderOrder = 10;
        particle.userData = { curve, progress, speed };
        particleGroup.add(particle);

        for (let trailIndex = 1; trailIndex <= 3; trailIndex += 1) {
          const trail = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: glowTexture,
              color: pathParticleColor,
              transparent: true,
              opacity: 0.18 / trailIndex,
              blending: THREE.AdditiveBlending,
              depthTest: false,
              depthWrite: false
            })
          );
          const trailSize = 5.4 / Math.sqrt(trailIndex);
          trail.scale.set(trailSize, trailSize, 1);
          trail.renderOrder = 9;
          trail.userData = {
            curve,
            progress: (progress - trailIndex * 0.026 + 1) % 1,
            speed,
            trailing: trailIndex
          };
          particleGroup.add(trail);
        }
      });
    }

    if (largeGraph) {
      const pointGeometry = new THREE.BufferGeometry();
      const pointNodes = layout.filter((node) => !isCommunityNode(node));
      const pointPositions = new Float32Array(pointNodes.length * 3);
      const pointColors = new Float32Array(pointNodes.length * 3);
      pointNodes.forEach((node, index) => {
        const tier = nodeTierIndex.get(node.id) ?? 'tertiary';
        const tierStyle = nodeStyleForTier(tier);
        const color = new THREE.Color(tierStyle.color).lerp(new THREE.Color(tierStyle.glow), tier === 'core' ? 0.18 : 0.28);
        pointPositions[index * 3] = node.x;
        pointPositions[index * 3 + 1] = node.y;
        pointPositions[index * 3 + 2] = node.z;
        pointColors[index * 3] = color.r;
        pointColors[index * 3 + 1] = color.g;
        pointColors[index * 3 + 2] = color.b;
      });
      pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
      pointGeometry.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
      const nodePoints = new THREE.Points(
        pointGeometry,
        new THREE.PointsMaterial({
          map: dustTexture,
          vertexColors: true,
          size: hasPath || hasSelection ? 5.2 : 7.2,
          transparent: true,
          opacity: hasPath ? 0.28 : hasSelection ? 0.34 : 0.76,
          alphaTest: 0.02,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      nodePoints.userData.nodes = pointNodes;
      nodePoints.renderOrder = 5;
      nodeGroup.add(nodePoints);
      raycastTargets.push(nodePoints);
    }

    const communityDustPositions: number[] = [];
    const communityDustColors: number[] = [];
    const communityStarPositions: number[] = [];
    const communityStarColors: number[] = [];

    layout.forEach((node, nodeIndex) => {
      const shouldRenderDetailedNode =
        !largeGraph || (hasPath && pathNodeIds.has(node.id)) || (hasSelection && focusDetailIds.has(node.id)) || (!hasSelection && (node.weight ?? 0) >= 82);
      if (!shouldRenderDetailedNode) return;

      if (false && isCommunityNode(node)) {
        const nodeCount = Number(node.properties?.node_count ?? 0);
        const importance = Number(node.properties?.importance_score ?? (node.weight ?? 20) / 100);
        const incidentEdgeCount = communityEdgeCounts.get(node.id) ?? 1;
        const communityRadius = THREE.MathUtils.clamp(34 + Math.log1p(Math.max(1, nodeCount)) * 7.8 + importance * 24, 68, 126);
        const position = vecFromNode(node);
        const cloudColor = new THREE.Color('#65D6FF').lerp(new THREE.Color('#FFD54F'), THREE.MathUtils.clamp((importance - 0.72) * 1.6, 0, 0.72));
        const prominentCommunity = nodeIndex < 36 || (node.weight ?? 0) >= 98;
        const isHoverActive = hasHover && hoverIds.has(node.id);
        const activeOpacity = hasSelection || hasPath
          ? activeIds.has(node.id) || pathNodeIds.has(node.id)
            ? 0.3
            : 0.045
          : hasHover
            ? isHoverActive
              ? 0.38
              : 0.035
            : prominentCommunity
              ? 0.24
              : 0.075;

        const hitMesh = new THREE.Mesh(
          new THREE.SphereGeometry(communityRadius * 0.58, 18, 12),
          makeHitMaterial()
        ) as unknown as NodeMesh;
        hitMesh.position.copy(position);
        hitMesh.userData.node = node;
        hitMesh.renderOrder = 8;
        nodeGroup.add(hitMesh);
        nodeMeshes.push(hitMesh);
        raycastTargets.push(hitMesh);

        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: communityRegionTexture,
            color: cloudColor,
            transparent: true,
            opacity: activeOpacity,
              blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          })
        );
        const haloScaleX = communityRadius * (2.15 + hashUnit(`${node.id}-region-wide`) * 0.42);
        const haloScaleY = communityRadius * (1.06 + hashUnit(`${node.id}-region-thin`) * 0.18);
        halo.scale.set(haloScaleX, haloScaleY, 1);
        halo.position.copy(position).add(new THREE.Vector3(0, 0, -4));
        const galaxyRotation = hashUnit(`${node.id}-region-rot`) * Math.PI;
        halo.rotation.z = galaxyRotation;
        halo.renderOrder = 4;
        halo.userData = {
          baseScaleX: haloScaleX,
          baseScaleY: haloScaleY,
          phase: hashUnit(`${node.id}-region-phase`) * Math.PI * 2,
          spin: (hashUnit(`${node.id}-region-spin`) - 0.5) * 0.00012
        };
        nodeGroup.add(halo);

        const coreSize = THREE.MathUtils.clamp(5 + importance * 5 + (node.weight ?? 20) / 22, 8, 14);
        const core = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: starCoreTexture,
            color: cloudColor,
            transparent: true,
            opacity: hasHover ? (isHoverActive ? 0.82 : 0.22) : 0.56,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          })
        );
        core.scale.set(coreSize, coreSize, 1);
        core.position.copy(position).add(new THREE.Vector3(0, 0, 8));
        core.renderOrder = 8;
        core.userData = { baseScale: coreSize, phase: hashUnit(`${node.id}-core-phase`) * Math.PI * 2 };
        nodeGroup.add(core);

        const hotCore = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: hotCoreTexture,
            color: importance > 0.94 ? new THREE.Color('#FFF2A8') : new THREE.Color('#F0FBFF'),
            transparent: true,
            opacity: hasHover ? (isHoverActive ? 0.72 : 0.12) : 0.42,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          })
        );
        hotCore.scale.set(coreSize * 0.56, coreSize * 0.56, 1);
        hotCore.position.copy(position).add(new THREE.Vector3(0, 0, 10));
        hotCore.renderOrder = 9;
        hotCore.userData = { baseScale: coreSize * 0.56, phase: hashUnit(`${node.id}-hot-phase`) * Math.PI * 2 };
        nodeGroup.add(hotCore);

        const dustCount = prominentCommunity || isHoverActive
          ? Math.round(THREE.MathUtils.clamp(Math.log1p(incidentEdgeCount) * (isHoverActive ? 7 : 4), 12, isHoverActive ? 42 : 26))
          : 0;
        if (dustCount > 0) {
          for (let index = 0; index < dustCount; index += 1) {
            const angle = hashUnit(`${node.id}-dust-angle-${index}`) * Math.PI * 2;
            const radius = communityRadius * (0.18 + hashUnit(`${node.id}-dust-radius-${index}`) * 0.76);
            const ySquash = 0.38 + hashUnit(`${node.id}-dust-squash-${index}`) * 0.22;
            const localX = Math.cos(angle) * radius;
            const localY = Math.sin(angle) * radius * ySquash;
            const rotatedX = localX * Math.cos(galaxyRotation) - localY * Math.sin(galaxyRotation);
            const rotatedY = localX * Math.sin(galaxyRotation) + localY * Math.cos(galaxyRotation);
            communityDustPositions.push(
              position.x + rotatedX,
              position.y + rotatedY,
              position.z + (hashUnit(`${node.id}-dust-z-${index}`) - 0.5) * 34 + 4
            );
            const dustColor = new THREE.Color('#DDE5F3').lerp(cloudColor, 0.42 + hashUnit(`${node.id}-dust-color-${index}`) * 0.28);
            communityDustColors.push(dustColor.r, dustColor.g, dustColor.b);
          }
        }

        const starCount = Math.round(THREE.MathUtils.clamp(3 + importance * 5 + (isHoverActive ? 7 : 0), 3, isHoverActive ? 16 : prominentCommunity ? 9 : 5));
        for (let index = 0; index < starCount; index += 1) {
          const angle = hashUnit(`${node.id}-star-angle-${index}`) * Math.PI * 2;
          const radius = communityRadius * (0.12 + hashUnit(`${node.id}-star-radius-${index}`) * 0.48);
          const ySquash = 0.52 + hashUnit(`${node.id}-star-squash-${index}`) * 0.18;
          const localX = Math.cos(angle) * radius;
          const localY = Math.sin(angle) * radius * ySquash;
          const rotatedX = localX * Math.cos(galaxyRotation) - localY * Math.sin(galaxyRotation);
          const rotatedY = localX * Math.sin(galaxyRotation) + localY * Math.cos(galaxyRotation);
          communityStarPositions.push(
            position.x + rotatedX,
            position.y + rotatedY,
            position.z + (hashUnit(`${node.id}-star-z-${index}`) - 0.5) * 26 + 8
          );
          const starColor = new THREE.Color(index < 2 ? '#FFF2A8' : '#DDE5F3').lerp(cloudColor, 0.34);
          communityStarColors.push(starColor.r, starColor.g, starColor.b);
        }

        if (isHoverActive || nodeIndex < 18 || (node.weight ?? 0) >= 98.6 || layout.length <= 36) {
          const labelTexture = makeCommunityLabelTexture(node.name, node.properties?.node_count);
          const label = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: labelTexture,
              transparent: true,
              opacity: hasSelection || hasPath ? 0.38 : hasHover ? (isHoverActive ? 0.92 : 0.18) : 0.72,
              depthTest: false,
              depthWrite: false
            })
          );
          label.scale.set(66, 21, 1);
          label.position.copy(position).add(new THREE.Vector3(0, communityRadius * 0.82, 10));
          label.renderOrder = 10;
          label.userData = { baseScale: 66, labelAspect: 3.14, phase: hashUnit(`${node.id}-label`) * Math.PI * 2 };
          nodeGroup.add(label);
        }

        return;
      }

      const tier = nodeTierIndex.get(node.id) ?? 'tertiary';
      const tierStyle = nodeStyleForTier(tier);
      const communityNode = isCommunityNode(node);
      const isActive = hasPath
        ? pathNodeIds.has(node.id)
        : largeGraph && hasSelection
          ? focusDetailIds.has(node.id)
          : !hasSelection || activeIds.has(node.id);
      const isPathNode = hasPath && pathNodeIds.has(node.id);
      const glowColor = isPathNode ? new THREE.Color(nebulaTheme.path.nodeGlow) : new THREE.Color(tierStyle.glow);
      const bodyColor = isPathNode ? new THREE.Color(nebulaTheme.path.nodeCore) : new THREE.Color(tierStyle.color);
      const coreColor = isPathNode ? new THREE.Color(nebulaTheme.path.nodeCore) : new THREE.Color(tierStyle.core);
      const baseRadius = Math.max(6.4, Math.min(communityNode ? 18 : 15.2, 5.7 + (node.weight ?? 20) / (communityNode ? 8.2 : 9.5)));
      const tierScale = communityNode ? 1.16 : tier === 'core' ? 1.18 : tier === 'primary' ? 1.1 : tier === 'special' ? 1.08 : 1;
      const radius = baseRadius * tierScale * (isActive && (hasSelection || hasPath) ? 1.16 : 1);
      const inactiveOpacity = hasSelection || hasPath ? nebulaTheme.interaction.unrelatedNodeOpacity : 0.2;
      const starburstOpacity = isActive ? (hasPath ? 0.8 : 0.68) : inactiveOpacity;
      const coreOpacity = isActive ? (hasPath ? 0.92 : 0.78) : Math.max(0.1, inactiveOpacity * 1.4);
      const hotCoreOpacity = isActive ? (hasPath ? 0.96 : 0.84) : Math.max(0.12, inactiveOpacity * 1.6);
      const material = makeHitMaterial();
      const hitRadius = radius * (communityNode ? 1.62 : 1.55);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 24, 24), material) as unknown as NodeMesh;
      mesh.position.copy(vecFromNode(node));
      mesh.userData.node = node;
      mesh.renderOrder = 8;
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);
      raycastTargets.push(mesh);

      const starburst = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starburstTexture,
          color: glowColor,
          transparent: true,
          opacity: starburstOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      const burstScale = radius * 3.3;
      starburst.scale.set(burstScale, burstScale, 1);
      starburst.position.copy(mesh.position);
      starburst.renderOrder = 6;
      starburst.userData = {
        baseScale: burstScale,
        phase: Math.random() * Math.PI * 2,
        spin: communityNode ? 0.00035 + Math.random() * 0.00035 : 0.0009 + Math.random() * 0.0008,
        pulseSpeed: communityNode ? 0.72 : 1.8,
        pulseAmp: communityNode ? 0.035 : 0.055
      };
      nodeGroup.add(starburst);

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starCoreTexture,
          color: bodyColor,
          transparent: true,
          opacity: coreOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      core.scale.set(radius * 1.86, radius * 1.86, 1);
      core.position.copy(mesh.position);
      core.renderOrder = 7;
      core.userData = { baseScale: radius * 1.86, phase: Math.random() * Math.PI * 2, pulseSpeed: communityNode ? 0.72 : 1.8, pulseAmp: communityNode ? 0.032 : 0.055 };
      nodeGroup.add(core);

      const hotCore = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: hotCoreTexture,
          color: coreColor,
          transparent: true,
          opacity: hotCoreOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      const hotCoreScale = radius * 1.22;
      hotCore.scale.set(hotCoreScale, hotCoreScale, 1);
      hotCore.position.copy(mesh.position);
      hotCore.renderOrder = 8;
      hotCore.userData = { baseScale: hotCoreScale, phase: Math.random() * Math.PI * 2, pulseSpeed: communityNode ? 0.72 : 1.8, pulseAmp: communityNode ? 0.03 : 0.055 };
      nodeGroup.add(hotCore);

      if (communityNode && (nodeIndex < 16 || (node.weight ?? 0) >= 98.8)) {
        for (let rippleIndex = 0; rippleIndex < 1; rippleIndex += 1) {
          const rippleMaterial = new THREE.SpriteMaterial({
            map: rippleTexture,
            color: glowColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
          });
          const ripple = new THREE.Sprite(rippleMaterial);
          const rippleBase = radius * 2.35;
          ripple.scale.set(rippleBase, rippleBase, 1);
          ripple.position.copy(mesh.position).add(new THREE.Vector3(0, 0, 5 + rippleIndex));
          ripple.renderOrder = 5;
          ripple.userData = {
            ripple: true,
            baseScale: rippleBase,
            maxScale: radius * 4.15,
            phase: Math.random() * 0.35,
            speed: 0.045 + Math.random() * 0.012,
            maxOpacity: 0.055
          };
          nodeGroup.add(ripple);
        }
      }

      const shouldShowLabel = hasPath
        ? pathNodeIds.has(node.id)
        : hasSelection && (largeGraph ? focusDetailIds.has(node.id) : activeIds.has(node.id));
      if (shouldShowLabel) {
        const labelTexture = makeNodeLabelTexture(node.name);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            opacity: node.id === selectedNodeId ? 0.98 : 0.82,
            depthTest: false,
            depthWrite: false
          })
        );
        label.scale.set(82, 27, 1);
        label.position.copy(mesh.position).add(new THREE.Vector3(0, radius * 2.35, 10));
        label.renderOrder = 10;
        label.userData = { baseScale: 82, labelAspect: 3, phase: Math.random() * Math.PI * 2 };
      nodeGroup.add(label);
      }
    });

    const addCommunityPointBatch = (positions: number[], colors: number[], size: number, opacity: number, renderOrder: number) => {
      if (positions.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          map: dustTexture,
          vertexColors: true,
          size,
          transparent: true,
          opacity,
          alphaTest: 0.02,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      points.renderOrder = renderOrder;
      nodeGroup.add(points);
    };

    addCommunityPointBatch(communityDustPositions, communityDustColors, hasHover ? 2.7 : 2.1, hasHover ? 0.48 : 0.34, 6);
    addCommunityPointBatch(communityStarPositions, communityStarColors, hasHover ? 3.7 : 2.8, hasSelection || hasPath ? 0.24 : hasHover ? 0.44 : 0.38, 7);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: largeGraph ? 10 : 4 };
    const pointer = new THREE.Vector2();
    let hovered: NodePosition | undefined;
    let isDragging = false;
    let dragDistance = 0;
    let lastX = 0;
    let lastY = 0;
    let cameraTargetZ = camera.position.z;

    if (focusTargetRef.current?.active) {
      cameraTargetZ = focusTargetRef.current.cameraZ;
    }

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickNodeAtPointer = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(raycastTargets, false)[0];
      return hit?.object instanceof THREE.Points
        ? ((hit.object.userData.nodes as NodePosition[] | undefined)?.[hit.index ?? -1])
        : ((hit?.object as NodeMesh | undefined)?.userData.node);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isDragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        dragDistance += Math.abs(dx) + Math.abs(dy);
        root.rotation.y += dx * 0.003;
        root.rotation.x += dy * 0.002;
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      setPointer(event);
      const hitNode = pickNodeAtPointer();
      if (hitNode?.id !== hovered?.id) {
        hovered = hitNode;
        renderer.domElement.style.cursor = hitNode ? 'pointer' : 'grab';
        onHoverNode(hitNode);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (focusTargetRef.current) {
        focusTargetRef.current.active = false;
      }
      isDragging = true;
      dragDistance = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      setPointer(event);
      const pickedNode = pickNodeAtPointer() ?? hovered;
      if (pickedNode && dragDistance < 8) onSelectNode(pickedNode);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (focusTargetRef.current) {
        focusTargetRef.current.active = false;
      }
      cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ + event.deltaY * 0.62, MIN_CAMERA_Z, MAX_CAMERA_Z);
    };
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    let raf = 0;
    let handledCommandNonce = viewCommandRef.current?.nonce;
    const clock = new THREE.Clock();
    const fitCurrentView = () => {
      const fitNodes = hasPath
        ? Array.from(pathNodeIds)
            .map((id) => nodeMap.get(id))
            .filter((node): node is NodePosition => Boolean(node))
        : representativeOverviewNodes(layout, visibleEdges);
      const fit = hasPath
        ? chooseBestFitView(fitNodes, root.rotation, camera.aspect, cameraFov, root.scale.x, {
            padding: focusPadding(fitNodes.length),
            minFrame: communityView ? 420 : 400,
            minCameraZ: communityView ? 520 : 520,
            maxCameraZ: communityView ? 1320 : MAX_CAMERA_Z,
            preferDepth: 0.18,
            rotationDamping: 9
          })
        : chooseAutoFrameView(
              fitNodes,
              communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION,
              camera.aspect,
              cameraFov,
              root.scale.x,
              {
                padding: overviewPadding(layout.length),
                minFrame: communityView ? 400 : 360,
                minCameraZ: communityView ? 520 : 500,
                maxCameraZ: communityView ? 1380 : 1680,
                preferDepth: communityView ? 0.16 : 0.11,
                rotationDamping: 6
              }
            );
      focusTargetRef.current = {
        id: `manual-fit-${handledCommandNonce ?? 0}`,
        center: fit.center,
        cameraZ: fit.cameraZ,
        rotation: fit.rotation,
        active: true
      };
      cameraTargetZ = fit.cameraZ;
    };
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const command = viewCommandRef.current;
      if (command && command.nonce !== handledCommandNonce) {
        handledCommandNonce = command.nonce;
        if (command.type === 'zoom-in') {
          if (focusTargetRef.current) focusTargetRef.current.active = false;
          cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ * ZOOM_IN_FACTOR, MIN_CAMERA_Z, MAX_CAMERA_Z);
        } else if (command.type === 'zoom-out') {
          if (focusTargetRef.current) focusTargetRef.current.active = false;
          cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ * ZOOM_OUT_FACTOR, MIN_CAMERA_Z, MAX_CAMERA_Z);
        } else {
          fitCurrentView();
        }
      }
      stars.rotation.z += 0.00008;
      const backgroundDustOpacity = hasPath || hasSelection ? 0.04 : 0.08;
      (dust.material as THREE.PointsMaterial).opacity = backgroundDustOpacity * (1 + Math.sin(elapsed * 0.7) * 0.08);
      animateCosmicDust(cosmicDust, performance.now() * 0.001);
      point.intensity = 2.2 + Math.sin(elapsed * 1.5) * 0.25;
      particleGroup.children.forEach((sprite) => {
        const { curve, speed } = sprite.userData as { curve: THREE.CatmullRomCurve3; progress: number; speed: number };
        sprite.userData.progress = (sprite.userData.progress + speed) % 1;
        sprite.position.copy(curve.getPoint(sprite.userData.progress));
      });
      nodeGroup.children.forEach((child) => {
        if (child.userData.ripple) {
          child.userData.phase = (child.userData.phase + child.userData.speed * 0.016) % 1;
          const progress = child.userData.phase;
          const eased = 1 - Math.pow(1 - progress, 2.4);
          const scale = THREE.MathUtils.lerp(child.userData.baseScale, child.userData.maxScale, eased);
          child.scale.set(scale, scale, 1);
          const material = (child as THREE.Sprite).material as THREE.SpriteMaterial;
          material.opacity = child.userData.maxOpacity * Math.sin(progress * Math.PI) * (1 - progress * 0.28);
          return;
        }
        if ('baseScaleX' in child.userData && 'baseScaleY' in child.userData) {
          const pulse = 1 + Math.sin(elapsed * 0.55 + child.userData.phase) * 0.026;
          child.scale.set(child.userData.baseScaleX * pulse, child.userData.baseScaleY * pulse, 1);
          if ('spin' in child.userData) {
            child.rotation.z += child.userData.spin;
          }
          return;
        }
        if (!('baseScale' in child.userData)) return;
        const pulseSpeed = child.userData.pulseSpeed ?? 1.8;
        const pulseAmp = child.userData.pulseAmp ?? 0.055;
        const scale = child.userData.baseScale * (1 + Math.sin(elapsed * pulseSpeed + child.userData.phase) * pulseAmp);
        if ('labelAspect' in child.userData) {
          child.scale.set(scale, scale / child.userData.labelAspect, 1);
        } else {
          child.scale.set(scale, scale, 1);
        }
        if ('spin' in child.userData) {
          child.rotation.z += child.userData.spin;
        }
      });
      if (focusTargetRef.current?.active) {
        const target = focusTargetRef.current;
        const focusDepthOffset = communityView ? 0.26 : 0.18;
        root.position.x += (-target.center.x - root.position.x) * 0.045;
        root.position.y += (-target.center.y - root.position.y) * 0.045;
        root.position.z += (-target.center.z * focusDepthOffset - root.position.z) * 0.034;
        root.rotation.x += (target.rotation.x - root.rotation.x) * 0.052;
        root.rotation.y += (target.rotation.y - root.rotation.y) * 0.052;
        root.rotation.z += (target.rotation.z - root.rotation.z) * 0.052;
        camera.position.z += (target.cameraZ - camera.position.z) * 0.04;
        cameraTargetZ = target.cameraZ;
        if (
          Math.abs(root.position.x + target.center.x) < 0.8 &&
          Math.abs(root.position.y + target.center.y) < 0.8 &&
          Math.abs(camera.position.z - target.cameraZ) < 1.2 &&
          Math.abs(root.rotation.x - target.rotation.x) < 0.006 &&
          Math.abs(root.rotation.y - target.rotation.y) < 0.006
        ) {
          target.active = false;
          cameraTargetZ = target.cameraZ;
        }
      } else {
        camera.position.z += (cameraTargetZ - camera.position.z) * 0.12;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      viewStateRef.current = {
        rootPosition: root.position.clone(),
        rootRotation: root.rotation.clone(),
        rootScale: root.scale.x,
        cameraZ: camera.position.z,
        dataSignature
      };
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (runtimeRef.current?.root === root) runtimeRef.current = undefined;
      mount.removeChild(renderer.domElement);
    };
  }, [
    data,
    dataSignature,
    communityView,
    focusedNodeId,
    highlightedPath,
    layout,
    minWeight,
    nodeTierIndex,
    onCanvasReady,
    onHoverNode,
    onSelectNode,
    selectedNodeId,
    visibleRelations
  ]);

  return <div className="nebula-canvas" ref={mountRef} />;
}
