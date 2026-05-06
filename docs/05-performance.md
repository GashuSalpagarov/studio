# 05. Производительность и mobile-версия

## TL;DR
Цели: 60 FPS на 4K-десктопе при DPR cap=2; LCP < 2.5s, INP < 200ms, CLS < 0.1. На мобильных 3D отключается — но **сценарий и анимации сохраняются** в упрощённом виде: Lenis + GSAP + SVG-линия + CSS-инверсия + infinite loop. Триггеры отключения Three.js: `(max-width: 768px)`, `Save-Data`, GPU tier ≤ 1. `prefers-reduced-motion: reduce` — отдельный жёсткий выключатель: статичная версия, без loop'а, без линии. Бюджеты ассетов жёсткие: GLB < 5 MB total, KTX2 текстуры < 2 MB total. Draw calls < 150.

## Десктоп-цели

| Метрика | Цель |
|---|---|
| FPS @ 1080p | 120, минимум 60 |
| FPS @ 4K | 60, минимум 45 |
| DPR | `Math.min(window.devicePixelRatio, 2)` |
| Draw calls | < 150 на любом сегменте |
| Triangles в кадре | < 1.5M |
| Active textures | < 24 |
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| TBT | < 200ms |

R3F: `<Canvas dpr={[1, 2]} performance={{ min: 0.5 }}>` + `<PerformanceMonitor>` для adaptive DPR.

```tsx
<PerformanceMonitor
  onIncline={() => setDpr(Math.min(window.devicePixelRatio, 2))}
  onDecline={() => setDpr(1)}
  flipflops={3}
  onFallback={() => setEffectsEnabled(false)}
/>
```

При трёх флипфлопах — отключаем Bloom/CA/локальные post-effects и оставляем базовый рендер.

## Мобильная версия (упрощённая, не статичный poster)

Главное отличие от прежнего плана: **на мобиле сценарий не отключается**. Сохраняются:

- Lenis (smooth scroll + `infinite: true` для loop'а);
- GSAP + ScrollTrigger (master timeline по 5 сценам);
- SVG-линия с `stroke-dashoffset` вместо WebGL-линии;
- CSS-инверсия на CTA через clip-path overlay + `@property` tokens;
- Кольцо прогресса (SVG, идентичный десктопу);
- Per-scene route transitions (упрощённые, на DOM/CSS).

Отключается / заменяется только:

- Three.js / WebGL сцена линии — заменяется SVG-вариантом;
- Опциональные wormhole-wipe эффекты — заменяются CSS-tween'ами (clip-path, mask);
- Post-FX — отсутствуют;
- Тяжёлые декорации (particle streaks вокруг точки) — отсутствуют либо упрощены до CSS-pseudo-элементов.

### Триггеры детекта (отключение Three.js)

`<Canvas>` не монтируется, если выполнено хотя бы одно условие:

| Условие | Проверка |
|---|---|
| Малый viewport | `window.matchMedia('(max-width: 768px)').matches` |
| Mobile UA | `navigator.userAgentData?.mobile === true` (с UA-detect фолбэком) |
| Save-Data | `navigator.connection?.saveData === true` |
| Низкий GPU | `detect-gpu` → `tier <= 1` или `gpu === undefined` |

Решение принимается **до** монтирования `<Canvas>`. SVG-вариант линии и DOM-сценарий рендерятся всегда (на любых устройствах) и являются единым источником истины для разметки сцен.

Это значит: на десктопе SVG-линия всё равно сэмплируется и присутствует в DOM (хотя и невидима под WebGL-canvas) — даёт SEO, доступность и «no-JS» поведение.

## Reduced motion (жёсткий выключатель)

`prefers-reduced-motion: reduce` — отдельная ветка, **не равно** мобильной версии:

| Поведение | Mobile (упрощённая) | Reduced motion |
|---|---|---|
| Lenis smooth scroll | Есть | **Нет** (нативный скролл) |
| Master timeline + ScrollTrigger | Есть | **Нет** |
| SVG-линия с прогрессом | Есть | **Нет** (статичный snapshot или скрыта) |
| Инверсия на CTA | Есть | **Нет** |
| Infinite loop | Есть | **Нет** |
| Кольцо прогресса | Есть | Опционально (статичное / скрытое) |

`reduced-motion` — статичная версия страницы: 5 блоков как обычные секции, без анимаций, без loop'а. Цель — соблюдение WCAG и не вызывать дискомфорт у пользователей с вестибулярной чувствительностью.

## Ассет-бюджеты

| Категория | Бюджет (total) | Замечания |
|---|---|---|
| GLB-модели | < 5 MB | Draco compression обязателен; mesh quantization 14-bit для positions |
| KTX2 текстуры | < 2 MB | BasisU UASTC для нормалей, ETC1S для albedo |
| HDR | < 1 MB | Один шумовой/градиентный envMap; не использовать настоящий HDR-фотопанорам |
| Шрифты | < 200 KB | WOFF2, subset латиница + кириллица |
| JS bundle (initial, gzip) | < 250 KB | Без R3F-сцены — критический путь |
| Total page weight (initial) | < 1.5 MB | Включая первый GLB и постер hero |

Pipeline:

```
gltf-transform optimize \
  --texture-compress ktx2 \
  --simplify true \
  --weld true \
  --quantize true \
  --instance true \
  in.glb out.glb
```

## Микрооптимизации

- **InstancedMesh** для частиц-стриков (если применяются) и любых повторяющихся объектов.
- **Frustum culling** включён по умолчанию; для линии и крупных объектов оставить, для частиц с big bounding box — отключать (`frustumCulled = false`).
- **Освещение**: один directional light + ambient. Никаких realtime shadows.
- **Material reuse**: общий `ShaderMaterial` для линии и эффектов, разница через uniforms.
- **`needsUpdate` дисциплина**: не дёргать на каждый кадр.
- **Текстура-атлас** для иконок этапов вместо отдельных файлов.
- **`react-three/drei` `<Preload all />`** на root-сцене.
- **Внутренние страницы** — переводить GlobalCanvas в `mode='off'` или минимум, не тратить FPS на простой.

## Мониторинг

| Среда | Инструмент |
|---|---|
| Dev | `stats-gl` overlay (FPS, draw calls, GPU memory) |
| Dev | `<Perf>` от `r3f-perf` (опционально, тяжелее) |
| Prod | `web-vitals` отправляет LCP/INP/CLS в Cloudflare Analytics или собственный endpoint |
| Prod | Sentry performance — длинные задачи и ошибки WebGL контекста |

## Доступность

- `prefers-reduced-motion: reduce` → статичная версия (см. выше). Это не «опция», это hard switch.
- Все overlay-тексты дублируются в DOM (не только в Troika), чтобы скрин-ридеры читали.
- Контраст overlay-текста проверяется на инвертированной палитре тоже.
- Tab-навигация работает по DOM-порядку независимо от 3D-сегмента.
- Skip-link «To CTA» в начале страницы для быстрого пропуска нарратива.
- Кольцо прогресса — `aria-hidden="true"`, чтобы не зашумлять скрин-ридер.

## Источники
- R3F scaling performance — <https://r3f.docs.pmnd.rs/advanced/scaling-performance>
- Codrops: «Building efficient three.js scenes» — <https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/>
- Utsubo: 100 three.js best practices — <https://www.utsubo.com/blog/threejs-best-practices-100-tips>
- Digital Applied: Core Web Vitals 2026 — <https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide>
- WCAG: prefers-reduced-motion — <https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html>
