"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";

const PARTICLE_COUNT = 1000;
const SCROLL_DRIVE_FACTOR = 10;
const CONE_HALF_ANGLE = Math.PI / 3; // 60° от оси +Z (полуугол)
const RESPAWN_PAST_CAMERA = 0.5;

// Камера: дефолтное состояние и dolly zoom end-point.
const INITIAL_CAMERA_Z = 5;
const INITIAL_FOV = 75;
const DOLLY_END_CAMERA_Z = 3.5;
const DOLLY_END_FOV = 95;
const DOLLY_END_PROGRESS = 0.05;

// Ядро фейдится к p=0.5 — после этого видны только частицы.
const CORE_FADE_START = 0.4;
const CORE_FADE_END = 0.5;

interface Props {
  progressRef: RefObject<number>;
}

function forwardConeRandom(out: { x: number; y: number; z: number }) {
  const azimuth = Math.random() * 2 * Math.PI;
  const phi = Math.random() * CONE_HALF_ANGLE;
  const sinPhi = Math.sin(phi);
  out.x = sinPhi * Math.cos(azimuth);
  out.y = sinPhi * Math.sin(azimuth);
  out.z = Math.cos(phi);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// Канвасная текстура с белым кругом — даёт круглые частицы вместо квадратных
// (дефолт PointsMaterial). Цвет берётся из material.color, прозрачность вне круга —
// из текстуры + alphaTest.
function createCircleTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function Scene3R3F({ progressRef }: Props) {
  const coreRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const prevPRef = useRef<number>(-1);
  const { camera, size } = useThree();

  const particleTexture = useMemo(() => createCircleTexture(), []);

  const coreRadius = useMemo(() => {
    const fovRad = (INITIAL_FOV * Math.PI) / 180;
    const viewportHeightWorld = 2 * INITIAL_CAMERA_Z * Math.tan(fovRad / 2);
    return (6 / size.height) * viewportHeightWorld;
  }, [size.height]);

  const { positions, directions, pathLengths, phases, geometry } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const directions = new Float32Array(PARTICLE_COUNT * 3);
    const pathLengths = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);
    const dir = { x: 0, y: 0, z: 0 };
    const respawnZ = INITIAL_CAMERA_Z + RESPAWN_PAST_CAMERA;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      forwardConeRandom(dir);
      directions[i * 3] = dir.x;
      directions[i * 3 + 1] = dir.y;
      directions[i * 3 + 2] = dir.z;
      pathLengths[i] = respawnZ / dir.z;
      phases[i] = Math.random() * pathLengths[i];
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 1e6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { positions, directions, pathLengths, phases, geometry };
  }, []);

  useFrame(() => {
    if (!coreRef.current || !pointsRef.current) return;
    const p = progressRef.current;
    const inScene = p > 0 && p < 1 ? 1 : 0;

    // Ядро фейдится к p=0.5; частицы видны до конца сцены.
    const coreFade =
      inScene * Math.max(0, Math.min(1, (CORE_FADE_END - p) / (CORE_FADE_END - CORE_FADE_START)));
    (coreRef.current.material as THREE.MeshBasicMaterial).opacity = coreFade;
    (pointsRef.current.material as THREE.PointsMaterial).opacity = inScene;

    // Dolly zoom применяется всегда — при выходе за сцену камера возвращается в дефолт.
    const dollyT = Math.max(0, Math.min(1, p / DOLLY_END_PROGRESS));
    const eased = easeInOutCubic(dollyT);
    const persp = camera as THREE.PerspectiveCamera;
    persp.position.z = lerp(INITIAL_CAMERA_Z, DOLLY_END_CAMERA_Z, eased);
    persp.fov = lerp(INITIAL_FOV, DOLLY_END_FOV, eased);
    persp.updateProjectionMatrix();

    if (!inScene) return;
    if (Math.abs(p - prevPRef.current) < 1e-6) return;
    prevPRef.current = p;

    const acc = p * SCROLL_DRIVE_FACTOR;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const local = acc - phases[i];

      if (local < 0) {
        positions[ix] = 0;
        positions[ix + 1] = 0;
        positions[ix + 2] = 1e6;
        continue;
      }

      const pl = pathLengths[i];
      let progress = local % pl;
      if (progress < 0) progress += pl;

      positions[ix] = directions[ix] * progress;
      positions[ix + 1] = directions[ix + 1] * progress;
      positions[ix + 2] = directions[ix + 2] * progress;
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <>
      <mesh ref={coreRef}>
        <circleGeometry args={[coreRadius, 64]} />
        <meshBasicMaterial color="#0a0a0a" transparent />
      </mesh>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          color="#0a0a0a"
          size={0.015}
          sizeAttenuation
          transparent
          map={particleTexture}
          alphaTest={0.5}
        />
      </points>
    </>
  );
}
