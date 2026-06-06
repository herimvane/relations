import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GraphData, GraphNode, GraphPath, GraphViewCommand, NodePosition } from '../types/graph';
import { createForceLayout } from './createForceLayout';
import { colorForGroup, colorForRelation } from './graphTheme';
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

const DEFAULT_ROOT_ROTATION = new THREE.Euler(-0.32, 0.38, -0.04);
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

function vecFromNode(node: NodePosition) {
  return new THREE.Vector3(node.x, node.y, node.z);
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
  const bendSign = hashUnit(`${seed}-bend`) > 0.5 ? 1 : -1;
  const depthSign = hashUnit(`${seed}-depth-sign`) > 0.46 ? 1 : -1;
  const distanceFactor = THREE.MathUtils.clamp(distance / 430, 0.36, 1.34);
  const weightFactor = THREE.MathUtils.clamp(1.15 - (options.weight ?? 30) / 180, 0.62, 1.08);
  const focusFactor = options.active ? 0.72 : 1;
  const lift = options.lift ?? 1;

  const planarNormal = new THREE.Vector3(-direction.y, direction.x, 0);
  if (planarNormal.lengthSq() < 0.0001) {
    planarNormal.set(1, 0, 0);
  }
  planarNormal.normalize();

  const bendAmount = (24 + distance * 0.15) * distanceFactor * weightFactor * focusFactor;
  const depthAmount = (28 + distance * 0.055) * lift * (0.74 + hashUnit(`${seed}-depth`) * 0.52);
  mid.add(planarNormal.multiplyScalar(bendAmount * bendSign));
  mid.z += depthAmount * depthSign;

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
  const vertical = Math.max(size.y, size.x / Math.max(aspect, 0.1), minFrame);
  const fovRadians = THREE.MathUtils.degToRad(fov);
  const distance = (vertical * padding) / (2 * Math.tan(fovRadians / 2));
  const depthAllowance = Math.max(0, size.z * 0.42);
  return {
    center,
    cameraZ: THREE.MathUtils.clamp(distance + depthAllowance, minCameraZ, maxCameraZ)
  };
}

function overviewPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(1.72 + nodeCount / 650, 1.82, 2.24);
}

function focusPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(0.96 + nodeCount / 520, 1.02, 1.36);
}

type FitChoice = FitView & {
  rotation: THREE.Euler;
};

function rotationCandidates(currentRotation: THREE.Euler) {
  const baseY = currentRotation.y;
  const candidates: THREE.Euler[] = [];
  const xAngles = [-0.52, -0.42, -0.32, -0.22, -0.12];
  const yAngles = [
    baseY - 0.82,
    baseY - 0.56,
    baseY - 0.32,
    baseY - 0.14,
    baseY,
    baseY + 0.14,
    baseY + 0.32,
    baseY + 0.56,
    baseY + 0.82,
    0.42,
    -0.42
  ];
  const zAngles = [-0.06, 0, 0.04];

  xAngles.forEach((x) => {
    yAngles.forEach((y) => {
      zAngles.forEach((z) => candidates.push(new THREE.Euler(x, y, z)));
    });
  });
  candidates.push(currentRotation.clone());
  return candidates;
}

function fitScore(nodes: NodePosition[], rotation: THREE.Euler, fit: FitView, aspect: number, scale: number) {
  const points = nodes.map((node) => vecFromNode(node).applyEuler(rotation).multiplyScalar(scale));
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x, 1);
  const height = Math.max(size.y, 1);
  const depth = Math.max(size.z, 1);
  const projectedAspect = Math.max(width / Math.max(aspect, 0.1), height) / Math.max(1, Math.min(width / Math.max(aspect, 0.1), height));
  const aspectPenalty = Math.abs(Math.log(projectedAspect)) * 90;
  const depthPenalty = depth * 0.16;
  return fit.cameraZ + aspectPenalty + depthPenalty;
}

function chooseBestFitView(
  nodes: NodePosition[],
  currentRotation: THREE.Euler,
  aspect: number,
  fov: number,
  scale: number,
  options: { padding: number; minFrame: number; minCameraZ: number }
): FitChoice {
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(), cameraZ: 720, rotation: currentRotation.clone() };
  }

  const candidates = nodes.length < 3 ? [currentRotation.clone(), DEFAULT_ROOT_ROTATION.clone()] : rotationCandidates(currentRotation);
  return candidates.reduce<FitChoice | undefined>((best, rotation) => {
    const fit = createFitView(nodes, rotation, aspect, fov, scale, options.padding, options.minFrame, options.minCameraZ);
    const choice = { ...fit, rotation };
    if (!best) return choice;
    return fitScore(nodes, rotation, fit, aspect, scale) < fitScore(nodes, best.rotation, best, aspect, scale) ? choice : best;
  }, undefined)!;
}

function representativeOverviewNodes(nodes: NodePosition[], edges: GraphData['edges']) {
  if (nodes.length <= 160) return nodes;
  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });
  return [...nodes]
    .sort((a, b) => {
      const scoreA = (a.weight ?? 0) * 1.7 + (degree.get(a.id) ?? 0) * 12;
      const scoreB = (b.weight ?? 0) * 1.7 + (degree.get(b.id) ?? 0) * 12;
      return scoreB - scoreA;
    })
    .slice(0, 160);
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
  const viewCommandRef = useRef(viewCommand);
  const visibleRelations = useMemo(() => new Set(relationTypes), [relationTypes]);
  const layout = useMemo(() => createForceLayout(data), [data]);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    focusedRef.current = focusedNodeId;
  }, [selectedNodeId, focusedNodeId]);

  useEffect(() => {
    viewCommandRef.current = viewCommand;
  }, [viewCommand]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e14, 0.00072);

    const cameraFov = 48;
    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 4200);
    camera.position.set(0, CAMERA_Y_OFFSET, viewStateRef.current?.cameraZ ?? 720);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x0a0e14, 0);
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const root = new THREE.Group();
    root.position.copy(viewStateRef.current?.rootPosition ?? new THREE.Vector3(0, 0, 0));
    root.rotation.copy(viewStateRef.current?.rootRotation ?? DEFAULT_ROOT_ROTATION);
    root.scale.setScalar(viewStateRef.current?.rootScale ?? 0.88);
    scene.add(root);

    if (!viewStateRef.current) {
      const initialFit = createFitView(
        layout,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        overviewPadding(layout.length),
        360,
        720
      );
      root.position.set(-initialFit.center.x, -initialFit.center.y, -initialFit.center.z * 0.18);
      camera.position.z = initialFit.cameraZ;
    }

    const ambient = new THREE.AmbientLight(0xa7c7ff, 0.92);
    scene.add(ambient);
    const point = new THREE.PointLight(0x8cd7ff, 2.8, 1400);
    point.position.set(0, -80, 360);
    scene.add(point);
    const rim = new THREE.PointLight(0x3b82f6, 1.1, 1800);
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
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x90a9d4, size: 1.45, transparent: true, opacity: 0.5, depthWrite: false })
    );
    scene.add(stars);

    const glowTexture = makeGlowTexture();
    const starburstTexture = makeStarburstTexture();
    const starCoreTexture = makeStarCoreTexture();
    const hotCoreTexture = makeHotCoreTexture();
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 620;
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
        color: 0x60789c,
        size: 1.15,
        transparent: true,
        opacity: 0.24,
        depthWrite: false
      })
    );
    scene.add(dust);

    const nodeMap = new Map(layout.map((node) => [node.id, node]));
    const activeIds = neighborIds(data, selectedNodeId, 1);
    const hasSelection = Boolean(selectedNodeId);
    const pathEdgeKeys = new Set(highlightedPath?.edges.map(graphEdgeKey) ?? []);
    const pathNodeIds = new Set(highlightedPath?.nodes.map((node) => node.id) ?? []);
    const hasPath = pathEdgeKeys.size > 0;
    const largeGraph = layout.length > LARGE_GRAPH_NODE_THRESHOLD;
    const nodeMeshes: NodeMesh[] = [];
    const raycastTargets: THREE.Object3D[] = [];

    const filteredEdges = data.edges.filter(
      (edge) => visibleRelations.has(edge.relation_type) && (edge.weight ?? 0) >= minWeight
    );
    const focusEdges =
      largeGraph && selectedNodeId
        ? filteredEdges
            .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
            .slice(0, LARGE_GRAPH_FOCUS_EDGE_LIMIT)
        : [];
    const focusEdgeKeys = new Set(focusEdges.map(graphEdgeKey));
    const focusDetailIds = new Set<string>(selectedNodeId ? [selectedNodeId] : []);
    focusEdges.forEach((edge) => {
      focusDetailIds.add(edge.source);
      focusDetailIds.add(edge.target);
    });
    pathNodeIds.forEach((id) => focusDetailIds.add(id));

    const visibleEdges = largeGraph
      ? hasSelection
        ? [
            ...focusEdges,
            ...filteredEdges
              .filter((edge) => !focusEdgeKeys.has(graphEdgeKey(edge)))
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
          minFrame: 430,
          minCameraZ: 520
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
          minFrame: 480,
          minCameraZ: 560
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

    const edgeGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    root.add(edgeGroup, particleGroup, nodeGroup);

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

    let animatedEdgeCount = 0;
    visibleEdges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
          console.warn('[NebulaGraph] Edge skipped because endpoint node is missing', edge);
          return;
        }
        const color = new THREE.Color(colorForRelation(edge.relation_type));
        const key = graphEdgeKey(edge);
        const isPathEdge = pathEdgeKeys.has(key);
        const lineColor = isPathEdge ? new THREE.Color(0xa7f3ff) : color;
        const isActive = hasPath
          ? isPathEdge
          : largeGraph && hasSelection
            ? focusEdgeKeys.has(key)
            : !hasSelection || edgeTouches(edge, activeIds);
        const material = new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: hasPath ? (isActive ? 0.68 : 0.035) : hasSelection ? (isActive ? 0.5 : 0.06) : 0.2,
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
            opacity: hasPath ? (isActive ? 0.74 : 0.1) : hasSelection ? (isActive ? 0.68 : 0.18) : 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const particle = new THREE.Sprite(particleMaterial);
          particle.scale.set(isActive ? 6.2 : 4.6, isActive ? 6.2 : 4.6, 1);
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
                opacity: (isActive ? 0.11 : 0.045) / trailIndex,
                blending: THREE.AdditiveBlending,
                depthWrite: false
              })
            );
            const trailSize = (isActive ? 4.4 : 3.1) / Math.sqrt(trailIndex);
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
      addMergedLines(largeMutedLinePositions, largeMutedLineColors, hasPath ? 0.025 : hasSelection ? 0.035 : 0.12, 1);
      addMergedLines(largeActiveLinePositions, largeActiveLineColors, hasPath ? 0.62 : hasSelection ? 0.48 : 0.2, 2);
    }

    if (largeGraph) {
      const pointGeometry = new THREE.BufferGeometry();
      const pointPositions = new Float32Array(layout.length * 3);
      const pointColors = new Float32Array(layout.length * 3);
      layout.forEach((node, index) => {
        const color = new THREE.Color(colorForGroup(node.group));
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
          vertexColors: true,
          size: hasPath || hasSelection ? 3.2 : 5.6,
          transparent: true,
          opacity: hasPath ? 0.13 : hasSelection ? 0.2 : 0.76,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      nodePoints.userData.nodes = layout;
      nodePoints.renderOrder = 5;
      nodeGroup.add(nodePoints);
      raycastTargets.push(nodePoints);
    }

    layout.forEach((node) => {
      const shouldRenderDetailedNode =
        !largeGraph || (hasPath && pathNodeIds.has(node.id)) || (hasSelection && focusDetailIds.has(node.id)) || (!hasSelection && (node.weight ?? 0) >= 82);
      if (!shouldRenderDetailedNode) return;

      const color = new THREE.Color(colorForGroup(node.group));
      const isActive = hasPath
        ? pathNodeIds.has(node.id)
        : largeGraph && hasSelection
          ? focusDetailIds.has(node.id)
          : !hasSelection || activeIds.has(node.id);
      const baseRadius = Math.max(6.4, Math.min(15.2, 5.7 + (node.weight ?? 20) / 9.5));
      const radius = baseRadius * (isActive && (hasSelection || hasPath) ? 1.18 : 1);
      const starburstOpacity = isActive ? 0.68 : 0.1;
      const coreOpacity = isActive ? 0.78 : 0.18;
      const hotCoreOpacity = isActive ? 0.84 : 0.22;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 24), material) as unknown as NodeMesh;
      mesh.position.copy(vecFromNode(node));
      mesh.userData.node = node;
      mesh.renderOrder = 8;
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);
      raycastTargets.push(mesh);

      const starburst = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starburstTexture,
          color,
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
        spin: 0.0009 + Math.random() * 0.0008
      };
      nodeGroup.add(starburst);

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starCoreTexture,
          color,
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
      core.userData = { baseScale: radius * 1.86, phase: Math.random() * Math.PI * 2 };
      nodeGroup.add(core);

      const hotCore = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: hotCoreTexture,
          color: 0xffffff,
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
      hotCore.userData = { baseScale: hotCoreScale, phase: Math.random() * Math.PI * 2 };
      nodeGroup.add(hotCore);

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
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(raycastTargets, false)[0];
      const hitNode =
        hit?.object instanceof THREE.Points
          ? ((hit.object.userData.nodes as NodePosition[] | undefined)?.[hit.index ?? -1])
          : ((hit?.object as NodeMesh | undefined)?.userData.node);
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
      if (hovered && dragDistance < 8) onSelectNode(hovered);
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
            padding: Math.max(1.08, focusPadding(fitNodes.length)),
            minFrame: 430,
            minCameraZ: 520
          })
        : {
            ...createFitView(
              fitNodes,
              DEFAULT_ROOT_ROTATION,
              camera.aspect,
              cameraFov,
              root.scale.x,
              1.34,
              460,
              620,
              1680
            ),
            rotation: DEFAULT_ROOT_ROTATION.clone()
          };
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
      point.intensity = 2.2 + Math.sin(elapsed * 1.5) * 0.25;
      particleGroup.children.forEach((sprite) => {
        const { curve, speed } = sprite.userData as { curve: THREE.CatmullRomCurve3; progress: number; speed: number };
        sprite.userData.progress = (sprite.userData.progress + speed) % 1;
        sprite.position.copy(curve.getPoint(sprite.userData.progress));
      });
      nodeGroup.children.forEach((child) => {
        if (!('baseScale' in child.userData)) return;
        const scale = child.userData.baseScale * (1 + Math.sin(elapsed * 1.8 + child.userData.phase) * 0.055);
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
        root.position.x += (-target.center.x - root.position.x) * 0.026;
        root.position.y += (-target.center.y - root.position.y) * 0.026;
        root.position.z += (-target.center.z * 0.18 - root.position.z) * 0.018;
        root.rotation.x += (target.rotation.x - root.rotation.x) * 0.032;
        root.rotation.y += (target.rotation.y - root.rotation.y) * 0.032;
        root.rotation.z += (target.rotation.z - root.rotation.z) * 0.032;
        camera.position.z += (target.cameraZ - camera.position.z) * 0.022;
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
        cameraZ: camera.position.z
      };
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [
    data,
    focusedNodeId,
    highlightedPath,
    layout,
    minWeight,
    onCanvasReady,
    onHoverNode,
    onSelectNode,
    selectedNodeId,
    visibleRelations
  ]);

  return <div className="nebula-canvas" ref={mountRef} />;
}
