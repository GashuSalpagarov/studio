"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const PARTICLE_COUNT = 1000;
const STREAK_COUNT = 200;
const STREAK_LENGTH = 0.3;
const SCROLL_DRIVE_FACTOR = 10;
const CONE_HALF_ANGLE = Math.PI / 3;
const RESPAWN_PAST_CAMERA = 0.5;

const INITIAL_CAMERA_Z = 5;
const INITIAL_FOV = 75;
const DOLLY_END_CAMERA_Z = 3.5;
const DOLLY_END_FOV = 95;
const DOLLY_END_PROGRESS = 0.05;
const FORWARD_DOLLY_END_CAMERA_Z = 2;
const FORWARD_DOLLY_END_PROGRESS = 0.85;

const PARALLAX_AMPLITUDE = 0.1;
const PARALLAX_LERP = 0.1;

// M9 — финальный сбор. На p=0.85..0.88 — пауза, затем стяжка частиц + reverse dolly камеры.
const COLLECT_START_PROGRESS = 0.88;

const CARD_APPROACH_FRACTION = 0.33;
const CARD_DEPART_FRACTION = 0.67;
const CARD_READ_PROGRESS = 1.5;
const CARD_PAST_PROGRESS = 4;
const CARD_FADE_FRACTION = 0.1;
const CARD_START_SCALE = 0.01;
const CARD_COLOR = "#1a1a1a";

type CardConfig = {
  startProgress: number;
  endProgress: number;
  dirX: number;
  dirZ: number;
  width: number;
  height: number;
  tiltX: number;
  tiltY: number;
};

const CARDS: CardConfig[] = [
  { startProgress: 0.40, endProgress: 0.51, dirX: 0.8, dirZ: 1, width: 1.4, height: 1.0, tiltX: -0.05, tiltY: -0.05 },
  { startProgress: 0.51, endProgress: 0.62, dirX: -0.8, dirZ: 1, width: 1.0, height: 1.4, tiltX: -0.05, tiltY: 0.05 },
  { startProgress: 0.62, endProgress: 0.73, dirX: 0.25, dirZ: 1, width: 1.2, height: 1.2, tiltX: -0.05, tiltY: -0.05 },
  { startProgress: 0.73, endProgress: 0.84, dirX: -0.25, dirZ: 1, width: 1.6, height: 0.9, tiltX: -0.05, tiltY: 0.05 },
];

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

function cameraZForProgress(p: number): number {
  if (p <= 0) return INITIAL_CAMERA_Z;
  if (p <= DOLLY_END_PROGRESS) {
    const t = p / DOLLY_END_PROGRESS;
    return lerp(INITIAL_CAMERA_Z, DOLLY_END_CAMERA_Z, easeInOutCubic(t));
  }
  if (p <= FORWARD_DOLLY_END_PROGRESS) {
    const t = (p - DOLLY_END_PROGRESS) / (FORWARD_DOLLY_END_PROGRESS - DOLLY_END_PROGRESS);
    return lerp(DOLLY_END_CAMERA_Z, FORWARD_DOLLY_END_CAMERA_Z, t);
  }
  if (p <= COLLECT_START_PROGRESS) {
    return FORWARD_DOLLY_END_CAMERA_Z;
  }
  const t = (p - COLLECT_START_PROGRESS) / (1 - COLLECT_START_PROGRESS);
  return lerp(FORWARD_DOLLY_END_CAMERA_Z, INITIAL_CAMERA_Z, easeInOutCubic(t));
}

function cameraFovForProgress(p: number): number {
  if (p <= 0) return INITIAL_FOV;
  if (p <= DOLLY_END_PROGRESS) {
    const t = p / DOLLY_END_PROGRESS;
    return lerp(INITIAL_FOV, DOLLY_END_FOV, easeInOutCubic(t));
  }
  if (p <= COLLECT_START_PROGRESS) {
    return DOLLY_END_FOV;
  }
  const t = (p - COLLECT_START_PROGRESS) / (1 - COLLECT_START_PROGRESS);
  return lerp(DOLLY_END_FOV, INITIAL_FOV, easeInOutCubic(t));
}

function collectionMultiplier(p: number): number {
  if (p <= COLLECT_START_PROGRESS) return 1;
  const t = (p - COLLECT_START_PROGRESS) / (1 - COLLECT_START_PROGRESS);
  return 1 - easeInOutCubic(Math.min(1, t));
}

function cardPathProgressForCardT(cardT: number): number {
  if (cardT < CARD_APPROACH_FRACTION) {
    const t = cardT / CARD_APPROACH_FRACTION;
    return lerp(0, CARD_READ_PROGRESS, easeInOutCubic(t));
  }
  if (cardT < CARD_DEPART_FRACTION) {
    return CARD_READ_PROGRESS;
  }
  const t = (cardT - CARD_DEPART_FRACTION) / (1 - CARD_DEPART_FRACTION);
  return lerp(CARD_READ_PROGRESS, CARD_PAST_PROGRESS, easeInOutCubic(t));
}

function cardOpacityForCardT(cardT: number): number {
  if (cardT < CARD_FADE_FRACTION) return cardT / CARD_FADE_FRACTION;
  if (cardT > 1 - CARD_FADE_FRACTION) return (1 - cardT) / CARD_FADE_FRACTION;
  return 1;
}

function cardScaleForCardT(cardT: number): number {
  if (cardT < CARD_APPROACH_FRACTION) {
    const t = cardT / CARD_APPROACH_FRACTION;
    return lerp(CARD_START_SCALE, 1, easeInOutCubic(t));
  }
  return 1;
}

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
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const cardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const prevPRef = useRef<number>(-1);
  const pointerRef = useRef({ x: 0, y: 0 });
  const { camera } = useThree();

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const particleTexture = useMemo(() => createCircleTexture(), []);

  const pointsData = useMemo(() => {
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

  const streaksData = useMemo(() => {
    const positions = new Float32Array(STREAK_COUNT * 2 * 3);
    const directions = new Float32Array(STREAK_COUNT * 3);
    const pathLengths = new Float32Array(STREAK_COUNT);
    const phases = new Float32Array(STREAK_COUNT);
    const dir = { x: 0, y: 0, z: 0 };
    const respawnZ = INITIAL_CAMERA_Z + RESPAWN_PAST_CAMERA;

    for (let i = 0; i < STREAK_COUNT; i++) {
      forwardConeRandom(dir);
      directions[i * 3] = dir.x;
      directions[i * 3 + 1] = dir.y;
      directions[i * 3 + 2] = dir.z;
      pathLengths[i] = respawnZ / dir.z;
      phases[i] = Math.random() * pathLengths[i];
      const ix = i * 6;
      positions[ix] = 0;
      positions[ix + 1] = 0;
      positions[ix + 2] = 1e6;
      positions[ix + 3] = 0;
      positions[ix + 4] = 0;
      positions[ix + 5] = 1e6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { positions, directions, pathLengths, phases, geometry };
  }, []);

  useFrame(() => {
    if (!pointsRef.current || !linesRef.current) return;
    const p = progressRef.current;
    const inScene = p > 0 && p < 1 ? 1 : 0;

    (pointsRef.current.material as THREE.PointsMaterial).opacity = inScene;
    (linesRef.current.material as THREE.LineBasicMaterial).opacity = inScene;

    for (let i = 0; i < CARDS.length; i++) {
      const card = CARDS[i];
      const ref = cardRefs.current[i];
      if (!ref) continue;
      const material = ref.material as THREE.MeshBasicMaterial;
      const active = p >= card.startProgress && p <= card.endProgress;
      if (active) {
        const cardT = (p - card.startProgress) / (card.endProgress - card.startProgress);
        const pathProgress = cardPathProgressForCardT(cardT);
        ref.position.set(card.dirX * pathProgress, 0, card.dirZ * pathProgress);
        ref.scale.setScalar(cardScaleForCardT(cardT));
        material.opacity = cardOpacityForCardT(cardT);
      } else {
        material.opacity = 0;
      }
    }

    const persp = camera as THREE.PerspectiveCamera;
    persp.position.z = cameraZForProgress(p);
    persp.fov = cameraFovForProgress(p);

    if (inScene) {
      const targetX = pointerRef.current.x * PARALLAX_AMPLITUDE;
      const targetY = pointerRef.current.y * PARALLAX_AMPLITUDE;
      persp.position.x = lerp(persp.position.x, targetX, PARALLAX_LERP);
      persp.position.y = lerp(persp.position.y, targetY, PARALLAX_LERP);
    } else {
      persp.position.x = 0;
      persp.position.y = 0;
    }

    persp.updateProjectionMatrix();

    if (!inScene) return;
    if (Math.abs(p - prevPRef.current) < 1e-6) return;
    prevPRef.current = p;

    const acc = p * SCROLL_DRIVE_FACTOR;
    const collectMult = collectionMultiplier(p);

    {
      const positions = pointsData.positions;
      const directions = pointsData.directions;
      const pathLengths = pointsData.pathLengths;
      const phases = pointsData.phases;

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
        let linearProgress = local % pl;
        if (linearProgress < 0) linearProgress += pl;

        const t = linearProgress / pl;
        const acceleratedProgress = pl * t * t * collectMult;

        positions[ix] = directions[ix] * acceleratedProgress;
        positions[ix + 1] = directions[ix + 1] * acceleratedProgress;
        positions[ix + 2] = directions[ix + 2] * acceleratedProgress;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    {
      const positions = streaksData.positions;
      const directions = streaksData.directions;
      const pathLengths = streaksData.pathLengths;
      const phases = streaksData.phases;

      for (let i = 0; i < STREAK_COUNT; i++) {
        const ix = i * 6;
        const local = acc - phases[i];

        if (local < 0) {
          positions[ix] = 0;
          positions[ix + 1] = 0;
          positions[ix + 2] = 1e6;
          positions[ix + 3] = 0;
          positions[ix + 4] = 0;
          positions[ix + 5] = 1e6;
          continue;
        }

        const pl = pathLengths[i];
        let linearProgress = local % pl;
        if (linearProgress < 0) linearProgress += pl;

        const t = linearProgress / pl;
        const front = pl * t * t * collectMult;
        const back = Math.max(0, front - STREAK_LENGTH * collectMult);

        const dirX = directions[i * 3];
        const dirY = directions[i * 3 + 1];
        const dirZ = directions[i * 3 + 2];

        positions[ix] = dirX * back;
        positions[ix + 1] = dirY * back;
        positions[ix + 2] = dirZ * back;
        positions[ix + 3] = dirX * front;
        positions[ix + 4] = dirY * front;
        positions[ix + 5] = dirZ * front;
      }
      linesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={pointsRef} geometry={pointsData.geometry} frustumCulled={false}>
        <pointsMaterial
          color="#0a0a0a"
          size={0.015}
          sizeAttenuation
          transparent
          map={particleTexture}
          alphaTest={0.5}
        />
      </points>
      <lineSegments ref={linesRef} geometry={streaksData.geometry} frustumCulled={false}>
        <lineBasicMaterial color="#0a0a0a" transparent />
      </lineSegments>
      {CARDS.map((card, i) => (
        <mesh
          key={`${card.startProgress}-${card.dirX}`}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          rotation={[card.tiltX, card.tiltY, 0]}
        >
          <planeGeometry args={[card.width, card.height]} />
          <meshBasicMaterial color={CARD_COLOR} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
