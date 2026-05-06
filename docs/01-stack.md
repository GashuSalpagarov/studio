# 01. Технический стек

## TL;DR
Next.js 15 (App Router) + React 19 + TypeScript strict; Lenis 1.3 для скролла; GSAP 3.13 + ScrollTrigger + SplitText через `@gsap/react`; React Three Fiber 9.6 + drei 10.7 + three.js r170 для 3D; `@14islands/r3f-scroll-rig` как мост DOM↔WebGL; постпроцессинг через `@react-three/postprocessing`. Хостинг — Cloudflare Pages + R2 + Stream.

## Выбор фреймворка: Next.js 15 vs Astro 5

Оба варианта валидны под одностраничный сайт с тяжёлым WebGL. Исследовательский разбор:

| Критерий | Next.js 15 (App Router) | Astro 5 + React island |
|---|---|---|
| Bundle initial load | Больше базы (RSC + client runtime) | Минимальный HTML, JS только в островах |
| Time-to-interactive (heavy 3D) | Сравнимо: WebGL всё равно лидирует в TTI | Лучше при множестве статических секций |
| Расширение в case studies | Нативно: file-based routing, RSC, ISR | Тоже умеет, но React-only острова теряют RSC-преимущества |
| Server actions / form / контакт | Из коробки | Нужен бэкенд-эндпоинт или Cloudflare Workers |
| Edge-deploy на Cloudflare Pages | OK через `@cloudflare/next-on-pages` | Нативно через `@astrojs/cloudflare` |
| Опыт команды R3F | Mainstream сценарий | Меньше публичных кейсов |
| Совместимость с `r3f-scroll-rig` | Нативно (Next/Vite) | Работает, но нужно вручную поднимать persistent canvas через ViewTransitions / Astro Islands |

**Рекомендация: Next.js 15 (App Router).**
Причины: (а) у промо-сайта есть путь роста в case studies — RSC-роутинг и динамические страницы кейсов окупятся; (б) `r3f-scroll-rig` и persistent GlobalCanvas в Next.js — отлаженный паттерн, в Astro между Island-перерендерами теряется WebGL-контекст без дополнительной обвязки; (в) server actions упростят форму обратной связи без отдельного Worker.

Astro 5 — fallback, если в течение проекта концепт сожмётся до строго статической одной страницы без планов на расширение.

## Сводная таблица: layer → выбор → причина

| Layer | Выбор | Версия (май 2026) | Причина |
|---|---|---|---|
| Framework | Next.js | 15.x (App Router) | RSC, file-routing, готовность к case studies |
| UI runtime | React | 19.x | Совместимость с R3F 9, новые хуки, transitions |
| Язык | TypeScript strict | 5.6+ | Шейдеры, uniforms, geometry — всё типизировано |
| Smooth scroll | Lenis + `lenis/react` | 1.3.x | Один источник скролла, отлично дружит с RAF GSAP и `useFrame` R3F |
| Animation | GSAP + ScrollTrigger + SplitText | 3.13.x | Полностью бесплатно после покупки Webflow в 2024; де-факто стандарт |
| GSAP в React | `@gsap/react` (`useGSAP`) | latest | Корректная очистка контекста в R3F-окружении |
| 3D | three.js | r170+ | База |
| 3D в React | React Three Fiber | 9.6+ | Декларативный граф сцены, useFrame, suspense для ассетов |
| 3D утилиты | drei | 10.7+ | `<View>`, `<ScrollControls>` (не используем), `useTexture`, `Html`, `Text` |
| Постпроцессинг | `@react-three/postprocessing` + `postprocessing` | latest | Bloom, ChromaticAberration, Vignette, Noise, EffectComposer |
| DOM↔WebGL bridge | `@14islands/r3f-scroll-rig` | latest | GlobalCanvas, `<UseCanvas>`, scroll-tracker для DOM-элементов |
| Текст в 3D | troika-three-text (через drei `<Text>`) | latest | SDF-шрифты, anti-alias на любом z |
| Линт/формат | Biome | latest | Один тул вместо ESLint+Prettier |
| Тесты | Playwright | latest | Visual regression на ключевых scroll-кадрах |
| Ассеты | `gltf-transform` + Draco + KTX2 | latest | Сжатие GLB, mesh-quantization, GPU-friendly текстуры |
| Перформанс-детект | `detect-gpu`, `stats-gl`, `web-vitals` | latest | Tier-разбивка, FPS overlay в dev, INP/LCP/CLS в prod |
| Хостинг | Cloudflare Pages + R2 + Stream/Images | — | Edge SSR/SSG, дешёвый storage для GLB/KTX2, видеотекстуры через Stream |

## Что НЕ берём и почему

| Технология | Причина отказа |
|---|---|
| **GSAP ScrollSmoother** | Дублирует Lenis. Lenis лучше интегрируется с R3F `useFrame` и не зависит от ScrollTrigger-внутренних RAF. |
| **Theatre.js** | Проект практически не развивается с 2024; для нашего нарратива достаточно GSAP-таймлайнов с лейблами. |
| **Locomotive Scroll** | С 2024 является тонкой обёрткой над Lenis — нет смысла добавлять прокси-слой. |
| **R3F `<ScrollControls>`** | Конфликтует с Lenis (две системы скролла). Используем единственный источник — Lenis. |
| **CSS Scroll-Driven Animations (`animation-timeline`)** | На май 2026 ещё неполная поддержка в Safari/Firefox-стабильных версиях; для критичной анимации полагаемся на GSAP. |
| **Three.js + vanilla** (без R3F) | Теряем декларативность и экосистему drei/postprocessing. |
| **Babylon.js** | Лишний размер бандла под наш нарративный сценарий; экосистема под scroll-сайты беднее. |
| **Three.js `WebGPURenderer`** | Стабилизация в r170 ещё неровная по драйверам; держим как опциональный апгрейд после релиза. |

## Ассет-pipeline (коротко)

1. Blender / DCC → GLB.
2. `gltf-transform optimize` (Draco для геометрии, KTX2 для текстур, mesh-quantization).
3. Бюджет: см. [05-performance.md](./05-performance.md).

## Источники
- Lenis: <https://github.com/darkroomengineering/lenis>, <https://lenis.darkroom.engineering/>
- GSAP в React: <https://gsap.com/resources/React/>, <https://www.npmjs.com/package/@gsap/react>
- R3F Canvas: <https://r3f.docs.pmnd.rs/api/canvas>
- `r3f-scroll-rig`: <https://github.com/14islands/r3f-scroll-rig>
- Postprocessing: <https://github.com/pmndrs/react-postprocessing>, <https://github.com/pmndrs/postprocessing>
