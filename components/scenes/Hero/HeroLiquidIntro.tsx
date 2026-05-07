'use client';

import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import styles from './Hero.module.css';

const TITLE_FONT_SIZE_PX = 64;
const CIRCLE_RADIUS_PX = 120;
const CIRCLE_START_Y = 800;
const FALL_START_S = 4.35;
const MERGE_START_S = 5.28;
const MERGE_END_S = 6.555;

const SPLASH_START_S = 5.32;
const SPLASH_DURATION_S = 0.98;
const SPLASH_LANDING_PROGRESS = 0.88;
const SPLASH_BASE_RADIUS = 30;
const SPLASH_ARC_HEIGHT = 80;
const SPLASH_LOGO_RX = 60;
const SPLASH_PHONE_RX = 90;
const SPLASH_FLAT_RY = 10;

const TEXT = 'Создаём цифровые\nпродукты';
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_WEIGHT = 500;
const LINE_HEIGHT = 1.25;
const LETTER_SPACING_EM = -0.02;
const PADDING_PX = 80;

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function measureTextSize(): THREE.Vector2 {
  if (typeof document === 'undefined') {
    return new THREE.Vector2(700, 240);
  }
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return new THREE.Vector2(700, 240);
  ctx.font = `${FONT_WEIGHT} ${TITLE_FONT_SIZE_PX}px ${FONT_FAMILY}`;
  const lines = TEXT.split('\n');
  const trackPx = LETTER_SPACING_EM * TITLE_FONT_SIZE_PX;
  let maxWidth = 0;
  for (const line of lines) {
    const baseW = ctx.measureText(line).width;
    const lineW = baseW + trackPx * Math.max(0, line.length - 1);
    if (lineW > maxWidth) maxWidth = lineW;
  }
  const lh = TITLE_FONT_SIZE_PX * LINE_HEIGHT;
  const totalH = lines.length * lh;
  return new THREE.Vector2(
    Math.ceil(maxWidth) + PADDING_PX * 2,
    Math.ceil(totalH) + PADDING_PX * 2,
  );
}

const VERT = /* glsl */ `
  varying vec2 vWorldPos;
  void main() {
    vWorldPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec2 uTextSize;
  uniform vec2 uCircleCenter;
  uniform float uCircleRadius;
  uniform float uMix;
  uniform float uTime;
  uniform vec2 uSplashLeftCenter;
  uniform vec2 uSplashLeftR;
  uniform float uSplashLeftAlpha;
  uniform vec2 uSplashRightCenter;
  uniform vec2 uSplashRightR;
  uniform float uSplashRightAlpha;
  varying vec2 vWorldPos;

  float liquidWobble(vec2 p, float t) {
    return sin(p.x * 0.04 + t * 7.0) * 1.0
         + sin(p.y * 0.05 + t * 5.0) * 0.8
         + sin((p.x + p.y) * 0.035 + t * 9.0) * 0.6;
  }

  float ellipseSDF(vec2 p, vec2 c, vec2 r) {
    vec2 d = p - c;
    return (length(d / r) - 1.0) * min(r.x, r.y);
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main() {
    // Главная клякса: рост → плато → стягивание к позиции кнопки
    float splashPhase = smoothstep(0.0, 0.25, uMix);
    float dissolvePhase = smoothstep(0.55, 1.0, uMix);

    float maxWidth = uTextSize.x * 0.42;
    float maxHeight = uTextSize.y * 0.5;

    float buttonRx = 90.0;
    float buttonRy = 26.0;

    float rx = mix(mix(uCircleRadius, maxWidth, splashPhase), buttonRx, dissolvePhase);
    float ry = mix(mix(uCircleRadius, maxHeight, splashPhase), buttonRy, dissolvePhase);

    vec2 r = max(vec2(rx, ry), vec2(0.5));

    float centerYOffset = mix(0.0, -40.0, splashPhase) + mix(0.0, -65.0, dissolvePhase);
    vec2 blobCenter = vec2(uCircleCenter.x, uCircleCenter.y + centerYOffset);

    float baseCircleDist = ellipseSDF(vWorldPos, blobCenter, r);

    float wobbleStrength = smoothstep(0.0, 0.18, uMix) * (1.0 - smoothstep(0.75, 1.0, uMix));
    float circleWobble = liquidWobble(vWorldPos, uTime) * 7.0 * wobbleStrength;
    float mainDist = baseCircleDist + circleWobble;

    // Сателлитная клякса слева — вылетает из главной по параболе в верхний угол
    float leftBase = ellipseSDF(vWorldPos, uSplashLeftCenter, uSplashLeftR);
    float leftWobble = liquidWobble(vWorldPos, uTime + 1.7) * 4.5 * uSplashLeftAlpha;
    float leftDist = leftBase + leftWobble;

    // Сателлитная клякса справа
    float rightBase = ellipseSDF(vWorldPos, uSplashRightCenter, uSplashRightR);
    float rightWobble = liquidWobble(vWorldPos, uTime + 3.1) * 4.5 * uSplashRightAlpha;
    float rightDist = rightBase + rightWobble;

    // Метаболл-объединение: пока сателлиты близко к главной, между ними висит жидкий мост
    float combined = mainDist;
    combined = smin(combined, leftDist, 24.0);
    combined = smin(combined, rightDist, 24.0);

    if (combined > 60.0) discard;

    float finalFade = smoothstep(0.9, 1.0, uMix);

    float alpha = (1.0 - smoothstep(-1.0, 1.0, combined)) * (1.0 - finalFade);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(0.039, 0.039, 0.039, alpha);
  }
`;

function Scene({ startMs }: { startMs: number | null }) {
  const { size } = useThree();
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const textSize = useMemo(() => measureTextSize(), []);

  const uniforms = useMemo(
    () => ({
      uTextSize: { value: textSize },
      uCircleCenter: { value: new THREE.Vector2(0, CIRCLE_START_Y) },
      uCircleRadius: { value: CIRCLE_RADIUS_PX },
      uMix: { value: 0 },
      uTime: { value: 0 },
      uSplashLeftCenter: { value: new THREE.Vector2(0, 1e6) },
      uSplashLeftR: { value: new THREE.Vector2(0.5, 0.5) },
      uSplashLeftAlpha: { value: 0 },
      uSplashRightCenter: { value: new THREE.Vector2(0, 1e6) },
      uSplashRightR: { value: new THREE.Vector2(0.5, 0.5) },
      uSplashRightAlpha: { value: 0 },
    }),
    [textSize],
  );

  useFrame(() => {
    if (startMs === null) return;
    const t = (performance.now() - startMs) / 1000;

    let m: number;
    let yProgress: number;
    if (t < FALL_START_S) {
      m = 0;
      yProgress = 0;
    } else if (t < MERGE_START_S) {
      m = 0;
      const linear = (t - FALL_START_S) / (MERGE_START_S - FALL_START_S);
      yProgress = linear ** 1.5;
    } else if (t < MERGE_END_S) {
      yProgress = 1;
      const linear = (t - MERGE_START_S) / (MERGE_END_S - MERGE_START_S);
      m = 1 - (1 - linear) ** 3;
    } else {
      m = 1;
      yProgress = 1;
    }

    // Сателлитные кляксы — параболическая траектория с быстрым стартом
    const W = size.width;
    const H = size.height;
    const leftEndX = -W / 2 + 70;
    const leftEndY = H / 2 - 44;
    const rightEndX = W / 2 - 105;
    const rightEndY = H / 2 - 44;

    let splashProgress = 0;
    if (t >= SPLASH_START_S) {
      splashProgress = Math.min((t - SPLASH_START_S) / SPLASH_DURATION_S, 1);
    }
    // Позиция достигает финала к 88% — последние 12% клякса доживает в углу
    const positionProgress = Math.min(splashProgress / SPLASH_LANDING_PROGRESS, 1);
    const eased = 1 - (1 - positionProgress) ** 1.6;
    const sinArc = Math.sin(eased * Math.PI);

    const leftX = leftEndX * eased;
    const leftY = leftEndY * eased + SPLASH_ARC_HEIGHT * sinArc;
    const rightX = rightEndX * eased;
    const rightY = rightEndY * eased + SPLASH_ARC_HEIGHT * sinArc;

    // Расплющивание заканчивается к моменту приземления
    const splashLand = smoothstep01(
      0.76 * SPLASH_LANDING_PROGRESS,
      SPLASH_LANDING_PROGRESS,
      splashProgress,
    );
    const leftRx = SPLASH_BASE_RADIUS + (SPLASH_LOGO_RX - SPLASH_BASE_RADIUS) * splashLand;
    const leftRy = SPLASH_BASE_RADIUS + (SPLASH_FLAT_RY - SPLASH_BASE_RADIUS) * splashLand;
    const rightRx = SPLASH_BASE_RADIUS + (SPLASH_PHONE_RX - SPLASH_BASE_RADIUS) * splashLand;
    const rightRy = SPLASH_BASE_RADIUS + (SPLASH_FLAT_RY - SPLASH_BASE_RADIUS) * splashLand;

    // После приземления плоская клякса плавно дезинтегрируется
    const splashAlpha =
      smoothstep01(0, 0.04, splashProgress) *
      (1 - smoothstep01(SPLASH_LANDING_PROGRESS, 1, splashProgress));

    if (matRef.current) {
      const u = matRef.current.uniforms as {
        uMix: { value: number };
        uCircleCenter: { value: THREE.Vector2 };
        uTime: { value: number };
        uSplashLeftCenter: { value: THREE.Vector2 };
        uSplashLeftR: { value: THREE.Vector2 };
        uSplashLeftAlpha: { value: number };
        uSplashRightCenter: { value: THREE.Vector2 };
        uSplashRightR: { value: THREE.Vector2 };
        uSplashRightAlpha: { value: number };
      };
      u.uMix.value = m;
      u.uCircleCenter.value.y = CIRCLE_START_Y * (1 - yProgress);
      u.uTime.value = t;

      if (splashAlpha < 0.01) {
        u.uSplashLeftCenter.value.set(0, 1e6);
        u.uSplashRightCenter.value.set(0, 1e6);
        u.uSplashLeftR.value.set(0.5, 0.5);
        u.uSplashRightR.value.set(0.5, 0.5);
      } else {
        u.uSplashLeftCenter.value.set(leftX, leftY);
        u.uSplashRightCenter.value.set(rightX, rightY);
        u.uSplashLeftR.value.set(leftRx, leftRy);
        u.uSplashRightR.value.set(rightRx, rightRy);
      }
      u.uSplashLeftAlpha.value = splashAlpha;
      u.uSplashRightAlpha.value = splashAlpha;
    }
  });

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[0, 0, 10]}
        zoom={1}
        left={-size.width / 2}
        right={size.width / 2}
        top={size.height / 2}
        bottom={-size.height / 2}
        near={0.1}
        far={100}
      />
      <mesh>
        <planeGeometry args={[size.width, size.height]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={VERT}
          fragmentShader={FRAG}
          transparent
        />
      </mesh>
    </>
  );
}

export function HeroLiquidIntro({ startMs }: { startMs: number | null }) {
  return (
    <div className={styles.liquidOverlay}>
      <Canvas dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <Scene startMs={startMs} />
      </Canvas>
    </div>
  );
}
