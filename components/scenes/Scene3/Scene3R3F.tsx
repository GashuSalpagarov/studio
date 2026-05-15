"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type CardContent, CARDS_CONTENT } from "./cardsData";

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

// Карточки летят строго вперёд по +Z с постоянной скоростью.
// pathProgress = CARD_PATH_READING + (p − pHold) · CARD_SPEED (это z-координата).
const CARD_SPEED = 25;
const CARD_PATH_BORN = -12; // рождение далеко в перспективе
const CARD_PATH_VISIBLE = -8; // конец фейд-ина, дальше полная непрозрачность
const CARD_PATH_READING = 1.5; // зона чтения у камеры
const CARD_PATH_FADE_OUT = 3; // начало фейд-аута после прохода
const CARD_PATH_PAST = 4; // ушла окончательно
const CARD_START_SCALE = 0.1; // x10 от размера частицы при появлении
const CARD_TEXTURE_SCALE = 768; // px на world-unit для canvas-текстур карточек

type CardConfig = {
  pHold: number; // p, когда карточка ровно в зоне чтения (z = CARD_PATH_READING)
  offsetX: number; // горизонтальный сдвиг от центра, постоянный во время полёта
  offsetY: number; // вертикальный сдвиг от центра, постоянный во время полёта
  width: number;
  height: number;
  tiltX: number;
  tiltY: number;
};

// Каждая карточка летит прямо к камере из своей точки около центра.
// Раскладка по 4 квадрантам: ↖ ↘ ↗ ↙ — чтобы не перекрывали друг друга на пролёте.
// Размер (w × h) посчитан так, чтобы в момент pHold карточка занимала ровно ту же
// долю экрана, что её grid-area в финальной сетке (для baseline-viewport 1920×1080,
// FOV=95°, камера на cam_z(pHold)). Формула: world_dim = screen_fraction × 2·d·tan(FOV/2)·AR.
const CARDS: CardConfig[] = [
  { pHold: 0.45, offsetX: -0.7, offsetY: 0.5, width: 1.29, height: 0.9, tiltX: -0.05, tiltY: -0.05 },
  { pHold: 0.58, offsetX: 0.7, offsetY: -0.5, width: 0.84, height: 0.94, tiltX: -0.05, tiltY: 0.05 },
  { pHold: 0.71, offsetX: 0.7, offsetY: 0.5, width: 1.43, height: 0.79, tiltX: -0.05, tiltY: -0.05 },
  { pHold: 0.84, offsetX: -0.7, offsetY: -0.5, width: 0.97, height: 0.65, tiltX: -0.05, tiltY: 0.05 },
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

// Параллакс выключен на стыках с CSS-точкой:
//  p ∈ [0, 0.2]    — точка ещё видна, фейдится → gate = 0
//  p ∈ [0.2, 0.25] — плавный rise → gate = 0..1
//  p ∈ [0.25, 0.9] — gate = 1 (parallax работает)
//  p ∈ [0.9, 0.95] — плавный fall → gate = 1..0
//  p ∈ [0.95, 1.0] — точка снова появляется в M9 → gate = 0
function parallaxGateForProgress(p: number): number {
  if (p < 0.2) return 0;
  if (p < 0.25) return easeInOutCubic((p - 0.2) / 0.05);
  if (p <= 0.9) return 1;
  if (p < 0.95) return 1 - easeInOutCubic((p - 0.9) / 0.05);
  return 0;
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

// Карточка летит вдоль своего луча с постоянной скоростью.
// Возвращает opacity в зависимости от pathProgress (или 0 если вне диапазона).
function cardOpacityForPath(pathProgress: number): number {
  if (pathProgress < CARD_PATH_BORN || pathProgress > CARD_PATH_PAST) return 0;
  if (pathProgress < CARD_PATH_VISIBLE) {
    return (pathProgress - CARD_PATH_BORN) / (CARD_PATH_VISIBLE - CARD_PATH_BORN);
  }
  if (pathProgress > CARD_PATH_FADE_OUT) {
    return (CARD_PATH_PAST - pathProgress) / (CARD_PATH_PAST - CARD_PATH_FADE_OUT);
  }
  return 1;
}

// Все карточки появляются на p=0.3 коротким фейдом (окно 0.30..0.35) в далёкой
// перспективе. До этого экран — частицы и фейдящаяся CSS-точка.
function cardSceneEntryGate(p: number): number {
  if (p < 0.3) return 0;
  if (p > 0.35) return 1;
  return easeInOutCubic((p - 0.3) / 0.05);
}

// Scale карточки: маленькая при появлении (x10 от частицы), вырастает до 1 в зоне чтения.
function cardScaleForP(p: number, pHold: number): number {
  const tStart = 0.3;
  if (p <= tStart) return CARD_START_SCALE;
  if (p >= pHold) return 1;
  const t = (p - tStart) / (pHold - tStart);
  return lerp(CARD_START_SCALE, 1, easeInOutCubic(t));
}

// Lateral-progress: 0 при появлении (p=0.3) → 1 в момент чтения (p=pHold).
// Карточка рождается в центре и плавно расходится к своему квадранту.
function cardLateralProgress(p: number, pHold: number): number {
  const tStart = 0.3;
  if (p <= tStart) return 0;
  if (p >= pHold) return 1;
  return easeInOutCubic((p - tStart) / (pHold - tStart));
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

// Простой word-wrap по ширине. Возвращает Y после последней строки.
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let yPos = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = `${line + words[i]} `;
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, yPos);
      line = `${words[i]} `;
      yPos += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, yPos);
  return yPos + lineHeight;
}

// Рендерит карточку кейса на canvas: bg, плейсхолдер превью, тег, заголовок,
// описание, кнопка-ссылка. Результат — CanvasTexture для меша.
function createCardTexture(
  content: CardContent,
  width: number,
  height: number,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * CARD_TEXTURE_SCALE);
  canvas.height = Math.round(height * CARD_TEXTURE_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const W = canvas.width;
  const H = canvas.height;
  const padding = 0.05 * H;
  const imgH = H * 0.55;
  const font = "system-ui, -apple-system, sans-serif";

  // Фон карточки.
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  // Плейсхолдер превью — диагональный градиент в тёмных серых.
  const grad = ctx.createLinearGradient(0, 0, W, imgH);
  grad.addColorStop(0, "#2a2a2a");
  grad.addColorStop(1, "#161616");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, imgH);

  // Контент под превью.
  ctx.textBaseline = "top";
  let y = imgH + padding;

  // Тег (UPPERCASE, мелкий, серый).
  ctx.fillStyle = "#888";
  ctx.font = `500 ${0.032 * H}px ${font}`;
  ctx.fillText(content.tag.toUpperCase(), padding, y);
  y += 0.05 * H;

  // Заголовок (крупный, светлый).
  ctx.fillStyle = "#fafafa";
  ctx.font = `600 ${0.072 * H}px ${font}`;
  ctx.fillText(content.title, padding, y);
  y += 0.1 * H;

  // Описание (с переносом).
  ctx.fillStyle = "#aaa";
  ctx.font = `400 ${0.038 * H}px ${font}`;
  wrapText(ctx, content.description, padding, y, W - padding * 2, 0.05 * H);

  // Кнопка-ссылка — у нижнего края.
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${0.038 * H}px ${font}`;
  ctx.textBaseline = "bottom";
  ctx.fillText("Посмотреть кейс →", padding, H - padding);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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

  const cardTextures = useMemo(
    () => CARDS.map((card, i) => createCardTexture(CARDS_CONTENT[i], card.width, card.height)),
    [],
  );

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
      // Квадратное смещение к 0: больше частиц с малой фазой →
      // плотный фронт у origin в окне фейда CSS-точки (p=0..0.05).
      phases[i] = Math.random() ** 2 * pathLengths[i];
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
      // Квадратное смещение к 0: больше частиц с малой фазой →
      // плотный фронт у origin в окне фейда CSS-точки (p=0..0.05).
      phases[i] = Math.random() ** 2 * pathLengths[i];
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

    const cardSceneEntry = cardSceneEntryGate(p);
    for (let i = 0; i < CARDS.length; i++) {
      const card = CARDS[i];
      const ref = cardRefs.current[i];
      if (!ref) continue;
      const material = ref.material as THREE.MeshBasicMaterial;
      if (!inScene || cardSceneEntry === 0) {
        material.opacity = 0;
        ref.visible = false;
        continue;
      }
      const z = CARD_PATH_READING + (p - card.pHold) * CARD_SPEED;
      const opacity = cardOpacityForPath(z) * cardSceneEntry;
      material.opacity = opacity;
      // visible=false снимает меш с рендера, когда он невидим. Без этого
      // замороженная (после fade-out) плоскость карточки даёт артефакт,
      // когда камера в M9 уезжает назад и проходит через её z-позицию.
      ref.visible = opacity > 0;
      if (opacity > 0) {
        const lateral = cardLateralProgress(p, card.pHold);
        ref.position.set(card.offsetX * lateral, card.offsetY * lateral, z);
        ref.scale.setScalar(cardScaleForP(p, card.pHold));
      }
    }

    const persp = camera as THREE.PerspectiveCamera;
    persp.position.z = cameraZForProgress(p);
    persp.fov = cameraFovForProgress(p);

    if (inScene) {
      const gate = parallaxGateForProgress(p);
      const targetX = pointerRef.current.x * PARALLAX_AMPLITUDE * gate;
      const targetY = pointerRef.current.y * PARALLAX_AMPLITUDE * gate;
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
          key={`${card.pHold}-${card.offsetX}-${card.offsetY}`}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          rotation={[card.tiltX, card.tiltY, 0]}
        >
          <planeGeometry args={[card.width, card.height]} />
          <meshBasicMaterial map={cardTextures[i]} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
