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
  focusNonce?: number;
  viewCommand?: GraphViewCommand;
  relationTypes: string[];
  minWeight: number;
  showLabels: boolean;
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

type GraphEntryTransition = {
  active: boolean;
  frameApplied: boolean;
  startTime: number;
  duration: number;
  origin: THREE.Vector3;
  finalFrame?: FitChoice;
  nodeStartScale: number;
  edgeStartScale: number;
  nodeGroup: THREE.Group;
  edgeGroup: THREE.Group;
  particleGroup: THREE.Group;
  dustGroup: THREE.Group;
  stars: THREE.Points;
  backgroundDust: THREE.Points;
};

type FocusVisuals = {
  nodes: Map<string, THREE.Sprite[]>;
  labels: Map<string, THREE.Sprite>;
  edges: Array<{ edge: GraphData['edges'][number]; material: THREE.Material & { opacity: number }; activeOpacity: number; inactiveOpacity: number }>;
  particles: Array<{ edge: GraphData['edges'][number]; material: THREE.SpriteMaterial; activeOpacity: number; inactiveOpacity: number }>;
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
const DRILL_TRANSITION_DURATION = 1180;
let cachedNebulaCloudTextures: THREE.CanvasTexture[] | undefined;

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(value: number) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function materialList(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material];
}

function edgeTouchesFocus(edge: { source: string; target: string }, selectedId?: string, focusedId?: string) {
  return Boolean(
    (selectedId && (edge.source === selectedId || edge.target === selectedId)) ||
    (focusedId && (edge.source === focusedId || edge.target === focusedId))
  );
}

function rememberBaseOpacity(object: THREE.Object3D) {
  object.traverse((child) => {
    const material = (child as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    if (!material) return;
    materialList(material).forEach((item) => {
      if (!('opacity' in item)) return;
      item.userData.baseOpacity ??= item.opacity;
      item.transparent = true;
    });
  });
}

function setObjectOpacityScale(object: THREE.Object3D, scale: number) {
  object.traverse((child) => {
    const material = (child as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    if (!material) return;
    materialList(material).forEach((item) => {
      if (!('opacity' in item)) return;
      const baseOpacity = typeof item.userData.baseOpacity === 'number' ? item.userData.baseOpacity : item.opacity;
      item.opacity = baseOpacity * clamp01(scale);
    });
  });
}

function setGroupExpansion(group: THREE.Group, origin: THREE.Vector3, scale: number) {
  group.scale.setScalar(scale);
  group.position.copy(origin).multiplyScalar(1 - scale);
}

function setMaterialOpacity(material: THREE.Material & { opacity: number }, opacity: number) {
  material.opacity = opacity;
  material.transparent = true;
}

function transitionOrigin(origin: GraphViewCommand['origin'] | undefined, center: THREE.Vector3) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) {
    return center.clone();
  }
  const source = new THREE.Vector3(origin.x, origin.y, origin.z);
  const offset = source.sub(center);
  if (offset.length() > 180) offset.setLength(180);
  return center.clone().add(offset.multiplyScalar(0.45));
}

function fadeOutRetainedCanvas(mount: HTMLDivElement, renderer: THREE.WebGLRenderer) {
  const canvas = renderer.domElement;
  canvas.classList.add('nebula-exit-canvas');
  canvas.style.transition = 'none';
  canvas.style.opacity = '1';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '4';
  void canvas.offsetWidth;
  canvas.style.transition = 'opacity 640ms cubic-bezier(0.22, 1, 0.36, 1)';
  requestAnimationFrame(() => {
    canvas.style.opacity = '0';
  });
  window.setTimeout(() => {
    renderer.dispose();
    if (canvas.parentElement === mount) {
      mount.removeChild(canvas);
    }
  }, 720);
}

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

function createDistantStarField(texture: THREE.Texture, seed: string) {
  const random = seededRandom(`distant-stars-${seed}`);
  const starCount = 3000;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const palette = [
    new THREE.Color('#f8fbff'),
    new THREE.Color('#dcecff'),
    new THREE.Color('#c5fff4'),
    new THREE.Color('#fff2c8'),
    new THREE.Color('#ffd7d1')
  ];

  for (let index = 0; index < starCount; index += 1) {
    const edgeBias = random();
    const spreadX = 1800 + edgeBias * 1850;
    const spreadY = 980 + edgeBias * 1080;
    positions[index * 3] = (random() - 0.5) * spreadX;
    positions[index * 3 + 1] = (random() - 0.5) * spreadY;
    positions[index * 3 + 2] = -1120 - random() * 1050;
    const color = palette[Math.floor(random() * palette.length)].clone();
    const dim = 0.52 + random() * 0.52;
    colors[index * 3] = color.r * dim;
    colors[index * 3 + 1] = color.g * dim;
    colors[index * 3 + 2] = color.b * dim;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const field = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: texture,
      vertexColors: true,
      size: 1.85,
      transparent: true,
      opacity: 0.2,
      alphaTest: 0.018,
      depthWrite: false
    })
  );
  field.renderOrder = -4;
  return field;
}

function createWideCosmicDust(texture: THREE.Texture, seed: string) {
  const random = seededRandom(`wide-dust-${seed}`);
  const dustCount = 2200;
  const positions = new Float32Array(dustCount * 3);
  const colors = new Float32Array(dustCount * 3);
  const cool = new THREE.Color('#9aa6bb');
  const teal = new THREE.Color('#b8fff3');
  const amber = new THREE.Color('#ffe8d6');

  for (let index = 0; index < dustCount; index += 1) {
    const lane = random() < 0.64;
    const x = (random() - 0.5) * 3350;
    const yBase = lane ? Math.sin(x * 0.0016 + random() * 1.2) * 155 : 0;
    positions[index * 3] = x;
    positions[index * 3 + 1] = yBase + (random() - 0.5) * (lane ? 1050 : 1760);
    positions[index * 3 + 2] = -660 - random() * 1160;
    const color = cool.clone().lerp(random() > 0.72 ? teal : amber, random() * 0.22);
    const dim = 0.34 + random() * 0.42;
    colors[index * 3] = color.r * dim;
    colors[index * 3 + 1] = color.g * dim;
    colors[index * 3 + 2] = color.b * dim;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: texture,
      vertexColors: true,
      size: 2.35,
      transparent: true,
      opacity: 0.075,
      alphaTest: 0.012,
      depthWrite: false
    })
  );
  dust.renderOrder = -3;
  return dust;
}

function createDarkNebulaVeil(cloudTextures: THREE.Texture[], seed: string) {
  const random = seededRandom(`dark-veil-${seed}`);
  const group = new THREE.Group();
  const colors = [new THREE.Color('#5c6f7a'), new THREE.Color('#7d6f84'), new THREE.Color('#43556f')];
  for (let index = 0; index < 7; index += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTextures[index % cloudTextures.length],
        color: colors[index % colors.length],
        transparent: true,
        opacity: index < 2 ? 0.033 : 0.022,
        blending: THREE.NormalBlending,
        depthTest: false,
        depthWrite: false
      })
    );
    const width = 680 + random() * 1080;
    const height = 190 + random() * 420;
    sprite.scale.set(width, height, 1);
    sprite.position.set((random() - 0.5) * 2450, (random() - 0.5) * 1380, -980 - random() * 720);
    sprite.rotation.z = -0.48 + (random() - 0.5) * 1.4;
    sprite.renderOrder = -2;
    sprite.userData = {
      baseX: sprite.position.x,
      baseY: sprite.position.y,
      baseZ: sprite.position.z,
      baseRotation: sprite.rotation.z,
      baseScaleX: sprite.scale.x,
      baseScaleY: sprite.scale.y,
      phase: random() * Math.PI * 2,
      drift: 8 + random() * 18,
      rotationSpeed: (random() - 0.5) * 0.00008
    };
    group.add(sprite);
  }
  return group;
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
  const text = name;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.font = '600 24px Inter, "PingFang SC", sans-serif';
  const textWidth = Math.ceil(measureCtx.measureText(text).width);
  const canvas = document.createElement('canvas');
  canvas.width = THREE.MathUtils.clamp(textWidth + 44, 128, 520);
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
  const title = name.replace(/^社交关系大图\s*|^企业\/风控关系图\s*/g, '');
  const subtitle = `${Number(count ?? 0).toLocaleString()} nodes`;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.font = '700 21px Inter, "PingFang SC", sans-serif';
  const titleWidth = Math.ceil(measureCtx.measureText(title).width);
  const canvas = document.createElement('canvas');
  canvas.width = THREE.MathUtils.clamp(titleWidth + 56, 180, 560);
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
  maxCameraZ = MAX_CAMERA_Z,
  trimQuantile = 0
): FitView {
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(), cameraZ: 720 };
  }

  const points = nodes.map((node) => vecFromNode(node).applyEuler(rotation).multiplyScalar(scale));
  const framePoints = trimQuantile > 0 && points.length > 24 ? trimPointCloud(points, trimQuantile) : points;
  const box = new THREE.Box3().setFromPoints(framePoints);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const spriteMargin = Math.max(28, Math.min(88, padding * 36));
  const vertical = Math.max(size.y + spriteMargin, (size.x + spriteMargin) / Math.max(aspect, 0.1), minFrame);
  const fovRadians = THREE.MathUtils.degToRad(fov);
  const distance = (vertical * padding) / (2 * Math.tan(fovRadians / 2));
  const depthAllowance = Math.max(0, size.z * 0.34);
  return {
    center,
    cameraZ: THREE.MathUtils.clamp(distance + depthAllowance, minCameraZ, maxCameraZ)
  };
}

function trimPointCloud(points: THREE.Vector3[], trimQuantile: number) {
  const lower = THREE.MathUtils.clamp(trimQuantile, 0, 0.2);
  const upper = 1 - lower;
  const pick = (values: number[], ratio: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * ratio)))];
  const xs = points.map((point) => point.x).sort((a, b) => a - b);
  const ys = points.map((point) => point.y).sort((a, b) => a - b);
  const zs = points.map((point) => point.z).sort((a, b) => a - b);
  const minX = pick(xs, lower);
  const maxX = pick(xs, upper);
  const minY = pick(ys, lower);
  const maxY = pick(ys, upper);
  const minZ = pick(zs, lower);
  const maxZ = pick(zs, upper);
  const trimmed = points.filter(
    (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY && point.z >= minZ && point.z <= maxZ
  );
  return trimmed.length >= Math.max(8, points.length * 0.5) ? trimmed : points;
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
  trimQuantile?: number;
};

type FrameMode = 'overview' | 'focus' | 'path' | 'drill' | 'drill-view';

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
  const framePoints = options.trimQuantile && points.length > 24 ? trimPointCloud(points, options.trimQuantile) : points;
  const box = new THREE.Box3().setFromPoints(framePoints);
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
    const fit = createFitView(
      nodes,
      rotation,
      aspect,
      fov,
      scale,
      options.padding,
      options.minFrame,
      options.minCameraZ,
      options.maxCameraZ ?? MAX_CAMERA_Z,
      options.trimQuantile ?? 0
    );
    const choice = { ...fit, rotation, score: fitScore(nodes, rotation, fit, aspect, scale, currentRotation, options) };
    if (!best) return choice;
    return choice.score < best.score ? choice : best;
  }, undefined)!;
}

function computeBestViewFrame(
  nodes: NodePosition[],
  currentRotation: THREE.Euler,
  aspect: number,
  fov: number,
  scale: number,
  options: {
    mode: FrameMode;
    communityView: boolean;
    nodeCount: number;
    baseRotation?: THREE.Euler;
  }
) {
  const fallbackRotation = options.baseRotation ?? currentRotation;
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(), cameraZ: 720, rotation: fallbackRotation.clone(), score: 0 };
  }

  const compactOverviewPadding = THREE.MathUtils.clamp(1.04 + options.nodeCount / 6200, 1.06, 1.18);
  const compactFocusPadding = THREE.MathUtils.clamp(1.02 + nodes.length / 1100, 1.06, 1.2);
  const standardMinFrame = options.communityView ? 315 : 295;
  const standardMinCameraZ = options.communityView ? 380 : 370;
  const standardMaxCameraZ = options.communityView ? 1160 : 1320;
  const standardSafetyScale = 1.06;
  const modeConfig = {
    overview: {
      padding: Math.max(1.06, compactOverviewPadding - 0.015),
      minFrame: standardMinFrame,
      minCameraZ: standardMinCameraZ,
      maxCameraZ: standardMaxCameraZ,
      preferDepth: options.communityView ? 0.2 : 0.16,
      rotationDamping: 5,
      trimQuantile: options.nodeCount > 80 ? (options.communityView ? 0.012 : 0.035) : 0.01
    },
    focus: {
      padding: Math.max(1.08, compactFocusPadding),
      minFrame: standardMinFrame,
      minCameraZ: standardMinCameraZ,
      maxCameraZ: standardMaxCameraZ,
      preferDepth: options.communityView ? 0.22 : 0.18,
      rotationDamping: 7
    },
    path: {
      padding: Math.max(1.08, compactFocusPadding),
      minFrame: standardMinFrame,
      minCameraZ: standardMinCameraZ,
      maxCameraZ: standardMaxCameraZ,
      preferDepth: 0.2,
      rotationDamping: 7
    },
    drill: {
      padding: 1.14,
      minFrame: 260,
      minCameraZ: 320,
      maxCameraZ: 980,
      preferDepth: 0.16,
      rotationDamping: 10
    },
    'drill-view': {
      padding: Math.max(1.08, compactOverviewPadding),
      minFrame: standardMinFrame,
      minCameraZ: standardMinCameraZ,
      maxCameraZ: standardMaxCameraZ,
      preferDepth: options.communityView ? 0.22 : 0.18,
      rotationDamping: 4
    }
  } satisfies Record<FrameMode, AutoFrameOptions>;

  const fit = chooseAutoFrameView(nodes, fallbackRotation, aspect, fov, scale, modeConfig[options.mode]);
  return { ...fit, cameraZ: Math.max(MIN_CAMERA_Z, fit.cameraZ * standardSafetyScale) };
}

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

function representativeDrillNodes(nodes: NodePosition[], edges: GraphData['edges']) {
  if (nodes.length <= 16) return nodes;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const ranked = rankCoreNodes({ nodes, edges })
    .map((item) => nodeMap.get(item.node.id))
    .filter((node): node is NodePosition => Boolean(node));
  const limit = THREE.MathUtils.clamp(Math.round(nodes.length * 0.58), 18, 96);
  return ranked.slice(0, limit);
}

function isCommunityView(data: GraphData) {
  return data.nodes.length > 0 && data.nodes.every(isCommunityNode);
}

export function NebulaGraph({
  data,
  selectedNodeId,
  focusedNodeId,
  highlightedPath,
  focusNonce,
  viewCommand,
  relationTypes,
  minWeight,
  showLabels,
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
  const graphTransitionRef = useRef<GraphEntryTransition>();
  const viewCommandRef = useRef(viewCommand);
  const showLabelsRef = useRef(showLabels);
  const onSelectNodeRef = useRef(onSelectNode);
  const onHoverNodeRef = useRef(onHoverNode);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const updateFocusVisualsRef = useRef<((selectedId?: string, focusedId?: string, path?: GraphPath) => void) | undefined>();
  const labelSpritesRef = useRef<THREE.Sprite[]>([]);
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
    onSelectNodeRef.current = onSelectNode;
    onHoverNodeRef.current = onHoverNode;
    onCanvasReadyRef.current = onCanvasReady;
  }, [onCanvasReady, onHoverNode, onSelectNode]);

  useEffect(() => {
    viewCommandRef.current = viewCommand;
  }, [viewCommand]);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    updateFocusVisualsRef.current?.(selectedNodeId, focusedNodeId, highlightedPath);
    if (updateFocusVisualsRef.current) return;
    labelSpritesRef.current.forEach((sprite) => {
      const material = sprite.material as THREE.SpriteMaterial;
      const baseOpacity = typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : material.opacity;
      material.userData.baseOpacity = baseOpacity;
      material.opacity = showLabels ? baseOpacity : 0;
    });
  }, [focusedNodeId, highlightedPath, selectedNodeId, showLabels]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    updateFocusVisualsRef.current?.(selectedNodeId, focusedNodeId, highlightedPath);

    const pathNodeIds = new Set(highlightedPath?.nodes.map((node) => node.id) ?? []);
    if (pathNodeIds.size > 0) {
      const pathNodes = Array.from(pathNodeIds)
        .map((id) => runtime.nodeMap.get(id))
        .filter((node): node is NodePosition => Boolean(node));
      const focusFit = computeBestViewFrame(
        pathNodes,
        runtime.root.rotation,
        runtime.camera.aspect,
        runtime.cameraFov,
        runtime.root.scale.x,
        {
          mode: 'path',
          communityView,
          nodeCount: data.nodes.length
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
    if (focusNodes.length === 0) return;
    const focusFit = computeBestViewFrame(
      focusNodes,
      runtime.root.rotation,
      runtime.camera.aspect,
      runtime.cameraFov,
      runtime.root.scale.x,
      {
        mode: 'focus',
        communityView,
        nodeCount: data.nodes.length
      }
    );
    focusTargetRef.current = {
      id: focusedNodeId,
      center: focusFit.center,
      cameraZ: focusFit.cameraZ,
      rotation: focusFit.rotation,
      active: true
    };
  }, [communityView, data, focusNonce, focusedNodeId, highlightedPath, selectedNodeId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    labelSpritesRef.current = [];

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(nebulaTheme.background.fog, 0.00072);

    const cameraFov = communityView ? 53 : 48;
    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 4200);
    const commandAtMount = viewCommandRef.current;
    const isDrillEntry = commandAtMount?.type === 'drill-in' || commandAtMount?.type === 'drill-out';
    const isOverviewMount = !selectedNodeId && !focusedNodeId && !highlightedPath;
    const rawSavedView = viewStateRef.current?.dataSignature === dataSignature ? viewStateRef.current : undefined;
    const savedView = !isDrillEntry && !isOverviewMount ? rawSavedView : undefined;
    camera.position.set(0, CAMERA_Y_OFFSET, savedView?.cameraZ ?? (communityView ? 780 : 720));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(new THREE.Color(nebulaTheme.background.canvas), 0);
    mount.appendChild(renderer.domElement);
    onCanvasReadyRef.current?.(renderer.domElement);

    const root = new THREE.Group();
    root.position.copy(savedView?.rootPosition ?? new THREE.Vector3(0, 0, 0));
    root.rotation.copy(savedView?.rootRotation ?? (communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION));
    root.scale.setScalar(savedView?.rootScale ?? (communityView ? 0.86 : 0.88));
    scene.add(root);

    let initialFit: FitChoice | undefined;
    initialFit = computeBestViewFrame(
      representativeOverviewNodes(layout, data.edges),
      communityView ? COMMUNITY_ROOT_ROTATION : root.rotation,
      camera.aspect,
      cameraFov,
      root.scale.x,
      {
        mode: 'overview',
        communityView,
        nodeCount: layout.length,
        baseRotation: communityView ? COMMUNITY_ROOT_ROTATION : root.rotation
      }
    );
    if (!savedView || isOverviewMount) {
      root.rotation.copy(initialFit.rotation);
      root.position.set(-initialFit.center.x, -initialFit.center.y, -initialFit.center.z * (communityView ? 0.3 : 0.18));
      const introCameraZ = isDrillEntry
        ? Math.min(MAX_CAMERA_Z, Math.max(initialFit.cameraZ + 120, initialFit.cameraZ * 1.34))
        : initialFit.cameraZ;
      camera.position.z = introCameraZ;
      if (!isDrillEntry) {
        focusTargetRef.current = {
          id: `initial-${dataSignature}`,
          center: initialFit.center,
          cameraZ: initialFit.cameraZ,
          rotation: initialFit.rotation,
          active: true
        };
      }
    }

    const ambient = new THREE.AmbientLight(0xbfc9d9, 0.74);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffe8d6, 2.2, 1400);
    point.position.set(0, -80, 360);
    scene.add(point);
    const rim = new THREE.PointLight(0x65d6ff, 0.72, 1800);
    rim.position.set(-420, 280, 520);
    scene.add(rim);

    const glowTexture = makeGlowTexture();
    const dustTexture = makeDustTexture();
    const nebulaCloudTextures = getNebulaCloudTextures();
    const starburstTexture = makeStarburstTexture();
    const starCoreTexture = makeStarCoreTexture();
    const hotCoreTexture = makeHotCoreTexture();
    const rippleTexture = makeRippleTexture();
    const communityRegionTexture = makeCommunityRegionTexture();

    const darkVeil = createDarkNebulaVeil(nebulaCloudTextures, dataSignature);
    scene.add(darkVeil);
    const stars = createDistantStarField(dustTexture, dataSignature);
    scene.add(stars);
    const dust = createWideCosmicDust(dustTexture, dataSignature);
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
      const focusFit = computeBestViewFrame(
        pathNodes,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          mode: 'path',
          communityView,
          nodeCount: layout.length
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
      const focusFit = computeBestViewFrame(
        focusNodes,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          mode: 'focus',
          communityView,
          nodeCount: layout.length
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
    const focusVisuals: FocusVisuals = {
      nodes: new Map(),
      labels: new Map(),
      edges: [],
      particles: []
    };
    const registerNodeSprite = (nodeId: string, sprite: THREE.Sprite) => {
      const sprites = focusVisuals.nodes.get(nodeId) ?? [];
      sprites.push(sprite);
      focusVisuals.nodes.set(nodeId, sprites);
    };

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
          : !hasSelection || edgeTouchesFocus(edge, selectedNodeId, focusedNodeId);
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
        focusVisuals.edges.push({
          edge,
          material,
          activeOpacity: Math.max(0.58, aggregateOpacity),
          inactiveOpacity: 0.045
        });
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
          focusVisuals.particles.push({
            edge,
            material: particleMaterial,
            activeOpacity: particleOpacity(true),
            inactiveOpacity: 0.08
          });

          for (let trailIndex = 1; trailIndex <= 3; trailIndex += 1) {
            const trailMaterial = new THREE.SpriteMaterial({
              map: glowTexture,
              color,
              transparent: true,
              opacity: trailOpacity(isActive) / trailIndex,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            });
            const trail = new THREE.Sprite(trailMaterial);
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
            focusVisuals.particles.push({
              edge,
              material: trailMaterial,
              activeOpacity: trailOpacity(true) / trailIndex,
              inactiveOpacity: 0.035 / trailIndex
            });
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

        if (isHoverActive || nodeIndex < 18 || (node.weight ?? 0) >= 98.6 || layout.length <= 160) {
          const labelTexture = makeCommunityLabelTexture(node.name, node.properties?.node_count);
          const labelOpacity = hasSelection || hasPath ? 0.38 : hasHover ? (isHoverActive ? 0.92 : 0.18) : 0.72;
          const label = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: labelTexture,
              transparent: true,
              opacity: showLabelsRef.current ? labelOpacity : 0,
              depthTest: false,
              depthWrite: false
            })
          );
          (label.material as THREE.SpriteMaterial).userData.baseOpacity = labelOpacity;
          const labelAspect = labelTexture.image.width / labelTexture.image.height;
          const labelHeight = 21;
          label.scale.set(labelHeight * labelAspect, labelHeight, 1);
          label.position.copy(position).add(new THREE.Vector3(0, communityRadius * 0.82, 10));
          label.renderOrder = 10;
          label.userData = { baseScale: labelHeight * labelAspect, labelAspect, phase: hashUnit(`${node.id}-label`) * Math.PI * 2 };
          nodeGroup.add(label);
          labelSpritesRef.current.push(label);
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
      registerNodeSprite(node.id, starburst);

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
      registerNodeSprite(node.id, core);

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
      registerNodeSprite(node.id, hotCore);

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

      const shouldShowLabel =
        (hasPath
          ? pathNodeIds.has(node.id)
          : hasSelection
            ? largeGraph
              ? focusDetailIds.has(node.id)
              : activeIds.has(node.id)
            : layout.length <= 240
              ? true
              : (node.weight ?? 0) >= 86 || nodeIndex < 48);
      if (shouldShowLabel) {
        const labelTexture = makeNodeLabelTexture(node.name);
        const labelAspect = labelTexture.image.width / labelTexture.image.height;
        const labelHeight = 27;
        const labelOpacity = node.id === selectedNodeId ? 0.98 : 0.82;
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            opacity: showLabelsRef.current ? labelOpacity : 0,
            depthTest: false,
            depthWrite: false
          })
        );
        (label.material as THREE.SpriteMaterial).userData.baseOpacity = labelOpacity;
        label.scale.set(labelHeight * labelAspect, labelHeight, 1);
        label.position.copy(mesh.position).add(new THREE.Vector3(0, radius * 2.35, 10));
        label.renderOrder = 10;
        label.userData = { baseScale: labelHeight * labelAspect, labelAspect, phase: Math.random() * Math.PI * 2 };
        nodeGroup.add(label);
        labelSpritesRef.current.push(label);
        focusVisuals.labels.set(node.id, label);
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

    updateFocusVisualsRef.current = (selectedId?: string, focusedId?: string, path?: GraphPath) => {
      const nextPathNodeIds = new Set(path?.nodes.map((node) => node.id) ?? []);
      const nextPathEdgeKeys = edgeSignatureSet(path?.edges);
      const nextActiveIds = neighborIds(data, selectedId, 1);
      if (focusedId) nextActiveIds.add(focusedId);
      if (selectedId) nextActiveIds.add(selectedId);
      nextPathNodeIds.forEach((id) => nextActiveIds.add(id));
      const hasNextPath = nextPathEdgeKeys.size > 0;
      const hasNextFocus = Boolean(selectedId || focusedId || hasNextPath);

      focusVisuals.nodes.forEach((sprites, nodeId) => {
        const active = hasNextPath ? nextPathNodeIds.has(nodeId) : !hasNextFocus || nextActiveIds.has(nodeId);
        sprites.forEach((sprite) => {
          const material = sprite.material as THREE.SpriteMaterial;
          material.userData.defaultOpacity ??= material.opacity;
          const defaultOpacity = Number(material.userData.defaultOpacity);
          const selectedBoost = nodeId === selectedId || nodeId === focusedId ? 1.18 : 1;
          setMaterialOpacity(material, hasNextFocus ? (active ? Math.min(1, Math.max(defaultOpacity, 0.66) * selectedBoost) : 0.08) : defaultOpacity);
        });
      });

      focusVisuals.edges.forEach((item) => {
        const active = hasNextPath ? edgeMatchesSignatures(item.edge, nextPathEdgeKeys) : !hasNextFocus || edgeTouchesFocus(item.edge, selectedId, focusedId);
        setMaterialOpacity(item.material, hasNextFocus ? (active ? item.activeOpacity : item.inactiveOpacity) : item.activeOpacity);
        item.material.depthTest = !active;
      });

      focusVisuals.particles.forEach((item) => {
        const active = hasNextPath ? edgeMatchesSignatures(item.edge, nextPathEdgeKeys) : !hasNextFocus || edgeTouchesFocus(item.edge, selectedId, focusedId);
        setMaterialOpacity(item.material, hasNextFocus ? (active ? item.activeOpacity : item.inactiveOpacity) : item.activeOpacity);
      });

      focusVisuals.labels.forEach((label, nodeId) => {
        const material = label.material as THREE.SpriteMaterial;
        const baseOpacity = typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : material.opacity;
        material.userData.baseOpacity = baseOpacity;
        const active = hasNextPath ? nextPathNodeIds.has(nodeId) : !hasNextFocus || nextActiveIds.has(nodeId);
        material.opacity = showLabelsRef.current && active ? (nodeId === selectedId || nodeId === focusedId ? 0.98 : baseOpacity) : 0;
      });
    };
    updateFocusVisualsRef.current(selectedNodeId, focusedNodeId, highlightedPath);

    if (isDrillEntry) {
      const entryOrigin = transitionOrigin(commandAtMount.origin, initialFit?.center ?? new THREE.Vector3());
      const fitNodes = commandAtMount.type === 'drill-in'
        ? representativeDrillNodes(layout, data.edges)
        : representativeOverviewNodes(layout, visibleEdges);
      const finalFrame = computeBestViewFrame(
        fitNodes,
        communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION,
        camera.aspect,
        cameraFov,
        root.scale.x,
        {
          mode: commandAtMount.type === 'drill-in' ? 'drill-view' : 'overview',
          communityView,
          nodeCount: layout.length,
          baseRotation: communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION
        }
      );
      [nodeGroup, edgeGroup, particleGroup, dustGroup, stars, dust].forEach(rememberBaseOpacity);
      setObjectOpacityScale(nodeGroup, 0);
      setObjectOpacityScale(edgeGroup, 0);
      setObjectOpacityScale(particleGroup, 0);
      setObjectOpacityScale(dustGroup, 0.18);
      setObjectOpacityScale(stars, 0.16);
      setObjectOpacityScale(dust, 0.12);
      setGroupExpansion(nodeGroup, entryOrigin, commandAtMount.type === 'drill-out' ? 1.08 : 0.14);
      setGroupExpansion(edgeGroup, entryOrigin, commandAtMount.type === 'drill-out' ? 1.03 : 0.24);
      setGroupExpansion(particleGroup, entryOrigin, commandAtMount.type === 'drill-out' ? 1.03 : 0.24);
      graphTransitionRef.current = {
        active: true,
        frameApplied: false,
        startTime: performance.now(),
        duration: DRILL_TRANSITION_DURATION,
        origin: entryOrigin,
        finalFrame,
        nodeStartScale: nodeGroup.scale.x,
        edgeStartScale: edgeGroup.scale.x,
        nodeGroup,
        edgeGroup,
        particleGroup,
        dustGroup,
        stars,
        backgroundDust: dust
      };
    } else {
      graphTransitionRef.current = undefined;
    }

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
      if (graphTransitionRef.current?.active) return;
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
        onHoverNodeRef.current(hitNode);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (graphTransitionRef.current?.active) return;
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
      if (graphTransitionRef.current?.active) return;
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      setPointer(event);
      const pickedNode = pickNodeAtPointer() ?? hovered;
      if (pickedNode && dragDistance < 8) onSelectNodeRef.current(pickedNode);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (graphTransitionRef.current?.active) return;
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
        ? computeBestViewFrame(fitNodes, root.rotation, camera.aspect, cameraFov, root.scale.x, {
            mode: 'path',
            communityView,
            nodeCount: layout.length
          })
        : computeBestViewFrame(
              fitNodes,
              communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION,
              camera.aspect,
              cameraFov,
              root.scale.x,
              {
                mode: 'overview',
                communityView,
                nodeCount: layout.length,
                baseRotation: communityView ? COMMUNITY_ROOT_ROTATION : DEFAULT_ROOT_ROTATION
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
        if (command.type === 'drill-in') {
          if (focusTargetRef.current) focusTargetRef.current.active = false;
        } else if (command.type === 'zoom-in') {
          if (focusTargetRef.current) focusTargetRef.current.active = false;
          const originNode = command.origin?.id ? nodeMap.get(command.origin.id) : undefined;
          if (originNode) {
            const focusFit = computeBestViewFrame([originNode], root.rotation, camera.aspect, cameraFov, root.scale.x, {
              mode: 'drill',
              communityView,
              nodeCount: layout.length
            });
            focusTargetRef.current = {
              id: `drill-preview-${command.nonce}`,
              center: focusFit.center,
              cameraZ: THREE.MathUtils.clamp(focusFit.cameraZ * 0.78, MIN_CAMERA_Z, MAX_CAMERA_Z),
              rotation: focusFit.rotation,
              active: true
            };
            cameraTargetZ = focusTargetRef.current.cameraZ;
          } else {
            cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ * ZOOM_IN_FACTOR, MIN_CAMERA_Z, MAX_CAMERA_Z);
          }
        } else if (command.type === 'zoom-out' || command.type === 'drill-out') {
          if (focusTargetRef.current) focusTargetRef.current.active = false;
          cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ * ZOOM_OUT_FACTOR, MIN_CAMERA_Z, MAX_CAMERA_Z);
        } else {
          fitCurrentView();
        }
      }
      const graphTransition = graphTransitionRef.current;
      if (graphTransition?.active) {
        const elapsedMs = performance.now() - graphTransition.startTime;
        const progress = clamp01(elapsedMs / graphTransition.duration);
        const nodeProgress = easeOutCubic((elapsedMs - 80) / 700);
        const edgeProgress = easeInOutCubic((elapsedMs - 420) / 620);
        const particleProgress = easeInOutCubic((elapsedMs - 620) / 560);
        const dustProgress = easeInOutCubic((elapsedMs - 40) / 760);
        const nodeScale = THREE.MathUtils.lerp(graphTransition.nodeStartScale, 1, nodeProgress);
        const edgeScale = THREE.MathUtils.lerp(graphTransition.edgeStartScale, 1, edgeProgress);

        setGroupExpansion(graphTransition.nodeGroup, graphTransition.origin, nodeScale);
        setGroupExpansion(graphTransition.edgeGroup, graphTransition.origin, edgeScale);
        setGroupExpansion(graphTransition.particleGroup, graphTransition.origin, edgeScale);
        setObjectOpacityScale(graphTransition.nodeGroup, nodeProgress);
        setObjectOpacityScale(graphTransition.edgeGroup, edgeProgress);
        setObjectOpacityScale(graphTransition.particleGroup, particleProgress);
        setObjectOpacityScale(graphTransition.dustGroup, THREE.MathUtils.lerp(0.18, 1, dustProgress));
        setObjectOpacityScale(graphTransition.stars, THREE.MathUtils.lerp(0.16, 1, dustProgress));
        setObjectOpacityScale(graphTransition.backgroundDust, THREE.MathUtils.lerp(0.12, 1, dustProgress));

        if (!graphTransition.frameApplied && graphTransition.finalFrame && elapsedMs >= 820) {
          graphTransition.frameApplied = true;
          focusTargetRef.current = {
            id: `drill-final-${dataSignature}`,
            center: graphTransition.finalFrame.center,
            cameraZ: graphTransition.finalFrame.cameraZ,
            rotation: graphTransition.finalFrame.rotation,
            active: true
          };
          cameraTargetZ = graphTransition.finalFrame.cameraZ;
        }

        if (progress >= 1) {
          graphTransition.active = false;
          setGroupExpansion(graphTransition.nodeGroup, graphTransition.origin, 1);
          setGroupExpansion(graphTransition.edgeGroup, graphTransition.origin, 1);
          setGroupExpansion(graphTransition.particleGroup, graphTransition.origin, 1);
          setObjectOpacityScale(graphTransition.nodeGroup, 1);
          setObjectOpacityScale(graphTransition.edgeGroup, 1);
          setObjectOpacityScale(graphTransition.particleGroup, 1);
          setObjectOpacityScale(graphTransition.dustGroup, 1);
          setObjectOpacityScale(graphTransition.stars, 1);
          setObjectOpacityScale(graphTransition.backgroundDust, 1);
        }
      }
      stars.rotation.z += 0.00008;
      const backgroundDustOpacity = hasPath || hasSelection ? 0.04 : 0.08;
      (dust.material as THREE.PointsMaterial).opacity = backgroundDustOpacity * (1 + Math.sin(elapsed * 0.7) * 0.08);
      darkVeil.children.forEach((child) => {
        if (!('baseX' in child.userData)) return;
        child.position.set(
          child.userData.baseX + Math.sin(elapsed * 0.018 + child.userData.phase) * child.userData.drift,
          child.userData.baseY + Math.cos(elapsed * 0.014 + child.userData.phase * 1.31) * child.userData.drift * 0.6,
          child.userData.baseZ
        );
        child.rotation.z = child.userData.baseRotation + Math.sin(elapsed * 0.012 + child.userData.phase) * 0.012 + elapsed * child.userData.rotationSpeed;
      });
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
      if (layout.length > 0 && !graphTransitionRef.current?.active) {
        viewStateRef.current = {
          rootPosition: root.position.clone(),
          rootRotation: root.rotation.clone(),
          rootScale: root.scale.x,
          cameraZ: camera.position.z,
          dataSignature
        };
      }
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (updateFocusVisualsRef.current) updateFocusVisualsRef.current = undefined;
      const cleanupCommand = viewCommandRef.current;
      if (cleanupCommand?.type === 'drill-in' || cleanupCommand?.type === 'drill-out') {
        fadeOutRetainedCanvas(mount, renderer);
        if (runtimeRef.current?.root === root) runtimeRef.current = undefined;
        return;
      }
      renderer.dispose();
      if (runtimeRef.current?.root === root) runtimeRef.current = undefined;
      mount.removeChild(renderer.domElement);
    };
  }, [
    data,
    dataSignature,
    communityView,
    highlightedPath,
    layout,
    minWeight,
    nodeTierIndex,
    visibleRelations
  ]);

  return <div className="nebula-canvas" ref={mountRef} />;
}
