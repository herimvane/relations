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
  cameraZ: number;
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

    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 1, 4200);
    camera.position.set(0, -48, viewStateRef.current?.cameraZ ?? 940);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x0a0e14, 1);
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const root = new THREE.Group();
    root.position.copy(viewStateRef.current?.rootPosition ?? new THREE.Vector3(0, 0, 0));
    root.rotation.copy(viewStateRef.current?.rootRotation ?? new THREE.Euler(-0.22, 0.28, -0.04));
    scene.add(root);

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

    const edgeGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    root.add(edgeGroup, particleGroup, nodeGroup);

    data.edges
      .filter((edge) => visibleRelations.has(edge.relation_type) && (edge.weight ?? 0) >= minWeight)
      .forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;
        const color = new THREE.Color(colorForRelation(edge.relation_type));
        const isActive = !hasSelection || edgeTouches(edge, activeIds);
        const material = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: hasSelection ? (isActive ? 0.42 : 0.045) : 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const curve = midpointCurve(source, target, isActive ? 1.2 : 0.75);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(42));
        const line = new THREE.Line(geometry, material);
        edgeGroup.add(line);

        const shouldAnimate = isActive || (edge.weight ?? 0) >= 62;
        if (shouldAnimate) {
          const progress = Math.random();
          const speed = 0.0022 + (edge.weight ?? 20) / 78000;
          const particleMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            transparent: true,
            opacity: hasSelection ? (isActive ? 0.82 : 0.22) : 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const particle = new THREE.Sprite(particleMaterial);
          particle.scale.set(isActive ? 11.5 : 7.5, isActive ? 11.5 : 7.5, 1);
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
                opacity: (isActive ? 0.2 : 0.09) / trailIndex,
                blending: THREE.AdditiveBlending,
                depthWrite: false
              })
            );
            const trailSize = (isActive ? 8.5 : 5.5) / Math.sqrt(trailIndex);
            trail.scale.set(trailSize, trailSize, 1);
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
      const radius = node.id === 'n-0' ? 13 : Math.max(4, Math.min(11, 3.8 + (node.weight ?? 20) / 10));
      const isActive = !hasSelection || activeIds.has(node.id);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 24), material) as unknown as NodeMesh;
      mesh.position.copy(vecFromNode(node));
      mesh.userData.node = node;
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);

      const outerHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: node.id === 'n-0' ? 0.5 : isActive ? 0.23 : 0.08,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      const haloSize = node.id === 'n-0' ? 104 : radius * 6.4;
      outerHalo.scale.set(haloSize, haloSize, 1);
      outerHalo.position.copy(mesh.position);
      nodeGroup.add(outerHalo);

      const innerHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: node.id === 'n-0' ? 0.78 : isActive ? 0.48 : 0.18,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      innerHalo.scale.set(node.id === 'n-0' ? 42 : radius * 3.1, node.id === 'n-0' ? 42 : radius * 3.1, 1);
      innerHalo.position.copy(mesh.position);
      nodeGroup.add(innerHalo);

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: node.id === 'n-0' ? 0xffffff : color,
          transparent: true,
          opacity: isActive ? 0.9 : 0.42,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false
        })
      );
      core.scale.set(radius * 1.45, radius * 1.45, 1);
      core.position.copy(mesh.position);
      core.userData = { baseScale: radius * 1.45, phase: Math.random() * Math.PI * 2 };
      nodeGroup.add(core);
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
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.7, 260, 1800);
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
        child.scale.set(scale, scale, 1);
      });
      if (focusedRef.current) {
        const focused = nodeMap.get(focusedRef.current);
        if (focused) {
          root.position.x += (-focused.x - root.position.x) * 0.035;
          root.position.y += (-focused.y - root.position.y) * 0.035;
          root.position.z += (-focused.z * 0.42 - root.position.z) * 0.025;
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
  }, [data, layout, minWeight, onCanvasReady, onHoverNode, onSelectNode, selectedNodeId, visibleRelations]);

  return <div className="nebula-canvas" ref={mountRef} />;
}
