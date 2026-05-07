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

const TEXT = 'Создаём цифровые\nпродукты';
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_WEIGHT = 500;
const LINE_HEIGHT = 1.25;
const LETTER_SPACING_EM = -0.02;
const PADDING_PX = 80;

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
  varying vec2 vWorldPos;

  float liquidWobble(vec2 p, float t) {
    return sin(p.x * 0.04 + t * 7.0) * 1.0
         + sin(p.y * 0.05 + t * 5.0) * 0.8
         + sin((p.x + p.y) * 0.035 + t * 9.0) * 0.6;
  }

  void main() {
    // Три фазы: рост → плато (клякса держится живой) → стягивание к позиции кнопки
    float splashPhase = smoothstep(0.0, 0.25, uMix);
    float dissolvePhase = smoothstep(0.55, 1.0, uMix);

    // Большая клякса накрывает зону текста и кнопки
    float maxWidth = uTextSize.x * 0.42;
    float maxHeight = uTextSize.y * 0.5;

    // Финальная форма — горизонтальная капсула на месте кнопки
    float buttonRx = 90.0;
    float buttonRy = 26.0;

    float rx = mix(mix(uCircleRadius, maxWidth, splashPhase), buttonRx, dissolvePhase);
    float ry = mix(mix(uCircleRadius, maxHeight, splashPhase), buttonRy, dissolvePhase);

    vec2 r = max(vec2(rx, ry), vec2(0.5));

    // Центр стекает вниз: точка удара → между текстом и кнопкой → центр кнопки
    float centerYOffset = mix(0.0, -40.0, splashPhase) + mix(0.0, -115.0, dissolvePhase);
    vec2 blobCenter = vec2(uCircleCenter.x, uCircleCenter.y + centerYOffset);

    vec2 d = vWorldPos - blobCenter;
    float baseCircleDist = (length(d / r) - 1.0) * min(r.x, r.y);

    // Жидкая волна максимальна на плато, затухает к финалу
    float wobbleStrength = smoothstep(0.0, 0.18, uMix) * (1.0 - smoothstep(0.75, 1.0, uMix));
    float circleWobble = liquidWobble(vWorldPos, uTime) * 7.0 * wobbleStrength;
    float circleDist = baseCircleDist + circleWobble;

    if (circleDist > 60.0) discard;

    // Финальное затухание — CSS-кнопка принимает эстафету
    float finalFade = smoothstep(0.9, 1.0, uMix);

    float alpha = (1.0 - smoothstep(-1.0, 1.0, circleDist)) * (1.0 - finalFade);
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
    if (matRef.current) {
      const uniforms = matRef.current.uniforms as {
        uMix: { value: number };
        uCircleCenter: { value: THREE.Vector2 };
        uTime: { value: number };
      };
      uniforms.uMix.value = m;
      uniforms.uCircleCenter.value.y = CIRCLE_START_Y * (1 - yProgress);
      uniforms.uTime.value = t;
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
