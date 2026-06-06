import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GraphData, GraphNode, NodePosition } from '../types/graph';
import { createForceLayout } from './createForceLayout';
import { colorForGroup, colorForRelation } from './graphTheme';
import { edgeTouches, neighborIds } from './graphInteractions';

type Props = {
  data: GraphData;
  selectedNodeId?: string;
  focusedNodeId?: string;
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
  active: boolean;
};

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

function midpointCurve(source: NodePosition, target: NodePosition, lift = 1) {
  const start = vecFromNode(source);
  const end = vecFromNode(target);
  const mid = start.clone().lerp(end, 0.5);
  const distance = start.distanceTo(end);
  mid.z += 46 * lift + distance * 0.08;
  mid.x += Math.sin((source.x + target.y) * 0.01) * 18;
  mid.y += Math.cos((source.y - target.x) * 0.01) * 18;
  return new THREE.CatmullRomCurve3([start, mid, end]);
}

function createFitView(
  nodes: NodePosition[],
  rotation: THREE.Euler,
  aspect: number,
  fov: number,
  scale: number,
  padding = 1.4,
  minFrame = 460
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
    cameraZ: THREE.MathUtils.clamp(distance + depthAllowance, 320, 1850)
  };
}

function overviewPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(0.64 + nodeCount / 700, 0.74, 1.08);
}

function focusPadding(nodeCount: number) {
  return THREE.MathUtils.clamp(0.94 + nodeCount / 420, 1.04, 1.42);
}

export function NebulaGraph({
  data,
  selectedNodeId,
  focusedNodeId,
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
  const visibleRelations = useMemo(() => new Set(relationTypes), [relationTypes]);
  const layout = useMemo(() => createForceLayout(data), [data]);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    focusedRef.current = focusedNodeId;
  }, [selectedNodeId, focusedNodeId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e14, 0.00072);

    const cameraFov = 48;
    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 4200);
    camera.position.set(0, -44, viewStateRef.current?.cameraZ ?? 720);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x0a0e14, 0);
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const root = new THREE.Group();
    root.position.copy(viewStateRef.current?.rootPosition ?? new THREE.Vector3(0, 0, 0));
    root.rotation.copy(viewStateRef.current?.rootRotation ?? new THREE.Euler(-0.22, 0.28, -0.04));
    root.scale.setScalar(viewStateRef.current?.rootScale ?? 1.12);
    scene.add(root);

    if (!viewStateRef.current) {
      const initialFit = createFitView(
        layout,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        overviewPadding(layout.length),
        260
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
    const dustCount = 460;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const angle = i * 0.42;
      const radius = 120 + Math.sqrt(i) * 28;
      dustPositions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 100;
      dustPositions[i * 3 + 1] = Math.sin(angle) * radius * 0.52 + (Math.random() - 0.5) * 80;
      dustPositions[i * 3 + 2] = ((i * 29) % 360) - 180;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: glowTexture,
        color: 0x4f83c8,
        size: 18,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    root.add(dust);

    const nodeMap = new Map(layout.map((node) => [node.id, node]));
    const activeIds = neighborIds(data, selectedNodeId, 1);
    const hasSelection = Boolean(selectedNodeId);
    const nodeMeshes: NodeMesh[] = [];

    if (focusedNodeId) {
      const focusNodes = Array.from(activeIds)
        .map((id) => nodeMap.get(id))
        .filter((node): node is NodePosition => Boolean(node));
      const focusFit = createFitView(
        focusNodes,
        root.rotation,
        camera.aspect,
        cameraFov,
        root.scale.x,
        focusPadding(focusNodes.length),
        260
      );
      focusTargetRef.current = {
        id: focusedNodeId,
        center: focusFit.center,
        cameraZ: focusFit.cameraZ,
        active: true
      };
    } else {
      focusTargetRef.current = undefined;
    }

    const edgeGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    root.add(edgeGroup, particleGroup, nodeGroup);

    data.edges
      .filter((edge) => visibleRelations.has(edge.relation_type) && (edge.weight ?? 0) >= minWeight)
      .forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
          console.warn('[NebulaGraph] Edge skipped because endpoint node is missing', edge);
          return;
        }
        const color = new THREE.Color(colorForRelation(edge.relation_type));
        const isActive = !hasSelection || edgeTouches(edge, activeIds);
        const material = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: hasSelection ? (isActive ? 0.5 : 0.06) : 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const curve = midpointCurve(source, target, isActive ? 1.2 : 0.75);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(42));
        const line = new THREE.Line(geometry, material);
        line.renderOrder = isActive ? 2 : 1;
        edgeGroup.add(line);

        const shouldAnimate = isActive || (!hasSelection && (edge.weight ?? 0) >= 62);
        if (shouldAnimate) {
          const progress = Math.random();
          const speed = 0.0022 + (edge.weight ?? 20) / 78000;
          const particleMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            transparent: true,
            opacity: hasSelection ? (isActive ? 0.68 : 0.18) : 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const particle = new THREE.Sprite(particleMaterial);
          particle.scale.set(isActive ? 7.2 : 5.2, isActive ? 7.2 : 5.2, 1);
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
                opacity: (isActive ? 0.14 : 0.055) / trailIndex,
                blending: THREE.AdditiveBlending,
                depthWrite: false
              })
            );
            const trailSize = (isActive ? 5.2 : 3.8) / Math.sqrt(trailIndex);
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

    layout.forEach((node) => {
      const color = new THREE.Color(node.id === 'n-0' ? '#ffffff' : colorForGroup(node.group));
      const radius = node.id === 'n-0' ? 18 : Math.max(7.4, Math.min(16.5, 6.4 + (node.weight ?? 20) / 8.5));
      const isActive = !hasSelection || activeIds.has(node.id);
      const starburstOpacity = isActive ? (node.id === 'n-0' ? 0.95 : 0.72) : 0.1;
      const coreOpacity = isActive ? (node.id === 'n-0' ? 0.96 : 0.84) : 0.18;
      const hotCoreOpacity = isActive ? (node.id === 'n-0' ? 0.98 : 0.9) : 0.22;
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

      const starburst = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starburstTexture,
          color: node.id === 'n-0' ? 0xffffff : color,
          transparent: true,
          opacity: starburstOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      const burstScale = node.id === 'n-0' ? 78 : radius * 3.7;
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
          color: node.id === 'n-0' ? 0xffffff : color,
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
      const hotCoreScale = node.id === 'n-0' ? radius * 1.42 : radius * 1.28;
      hotCore.scale.set(hotCoreScale, hotCoreScale, 1);
      hotCore.position.copy(mesh.position);
      hotCore.renderOrder = 8;
      hotCore.userData = { baseScale: hotCoreScale, phase: Math.random() * Math.PI * 2 };
      nodeGroup.add(hotCore);

      if (hasSelection && activeIds.has(node.id)) {
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
    const pointer = new THREE.Vector2();
    let hovered: NodeMesh | undefined;
    let isDragging = false;
    let dragDistance = 0;
    let lastX = 0;
    let lastY = 0;

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
      const hit = raycaster.intersectObjects(nodeMeshes, false)[0]?.object as NodeMesh | undefined;
      if (hit !== hovered) {
        hovered = hit;
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        onHoverNode(hit?.userData.node);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      isDragging = true;
      dragDistance = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      if (hovered && dragDistance < 8) onSelectNode(hovered.userData.node);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (focusTargetRef.current) {
        focusTargetRef.current.active = false;
      }
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.62, 260, 2200);
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
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
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
        root.position.x += (-target.center.x - root.position.x) * 0.05;
        root.position.y += (-target.center.y - root.position.y) * 0.05;
        root.position.z += (-target.center.z * 0.22 - root.position.z) * 0.026;
        camera.position.z += (target.cameraZ - camera.position.z) * 0.04;
        if (
          Math.abs(root.position.x + target.center.x) < 0.8 &&
          Math.abs(root.position.y + target.center.y) < 0.8 &&
          Math.abs(camera.position.z - target.cameraZ) < 1.2
        ) {
          target.active = false;
        }
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
