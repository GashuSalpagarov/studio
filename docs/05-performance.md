# 05. Производительность и mobile-fallback

## TL;DR
Цели: 60 FPS на 4K-десктопе при DPR cap=2; LCP < 2.5s, INP < 200ms, CLS < 0.1. На мобильных 3D полностью отключается — отдаётся статичный fallback. Триггеры отключения: `(max-width: 768px)`, `prefers-reduced-motion: reduce`, `Save-Data`, GPU tier ≤ 1. Бюджеты ассетов жёсткие: GLB < 5 MB total, KTX2 текстуры < 2 MB total, без HDR > 1 MB. Draw calls < 150.

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

При трёх флипфлопах — отключаем Bloom/CA/radial-blur и оставляем только базовый рендер.

## Мобильный fallback

3D на мобильных **отключается полностью**. Никакого «упрощённого WebGL» — только статичные изображения и CSS.

### Триггеры детекта

Сайт переключается в fallback, если выполнено хотя бы одно условие:

| Условие | Проверка |
|---|---|
| Малый viewport | `window.matchMedia('(max-width: 768px)').matches` |
| Mobile UA | `navigator.userAgentData?.mobile === true` (с UA-detect фолбэком) |
| Reduced motion | `window.matchMedia('(prefers-reduced-motion: reduce)').matches` |
| Save-Data | `navigator.connection?.saveData === true` |
| Низкий GPU | `detect-gpu` → `tier <= 1` или `gpu === undefined` |

Решение принимается **до** монтирования `<Canvas>`. Если хоть один триггер сработал — рендерится только DOM-вариант страницы.

### Fallback-контент

| Сегмент сценария | Замена |
|---|---|
| Hero | Статичный заголовок + постер (KTX2 → JPG/AVIF) |
| Compress to dot | Не применяется (нет 3D) |
| Travel along line | Скрытое или упрощённое: вертикальная декоративная линия в SVG |
| Wormhole 1..3 | Статичные постеры этапов с CSS-параллаксом (translateY на scroll) |
| Stage 1..3 | Полные DOM-секции с описанием этапов и скриншотами |
| Information base | Без изменений (DOM-секция) |
| Inversion loop | CSS `prefers-color-scheme` свитч в конце страницы, без зацикливания |

Постеры — отдельные `<picture>` с AVIF/WebP, ширина по brakepoint'ам, lazy-loading через `loading="lazy"`.

## Ассет-бюджеты

| Категория | Бюджет (total) | Замечания |
|---|---|---|
| GLB-модели | < 5 MB | Draco compression обязателен; mesh quantization 14-bit для positions |
| KTX2 текстуры | < 2 MB | BasisU UASTC для нормалей и важных карт, ETC1S для albedo/lightmaps |
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

- **InstancedMesh** для частиц-стриков и любых повторяющихся stage-объектов.
- **Frustum culling** включён по умолчанию; для трубки и крупных объектов оставить, для частиц с big bounding box — отключать (`frustumCulled = false`).
- **Освещение**: один directional light + ambient. Никаких realtime shadows — только bake'нутые.
- **Material reuse**: общий `ShaderMaterial` для частиц/трубки разных сегментов через uniforms.
- **`needsUpdate` дисциплина**: не дёргать на каждый кадр.
- **Текстура-атлас** для иконок этапов вместо отдельных файлов.
- **`react-three/drei` `<Preload all />`** на root-сцене.
- **`useTexture.preload`** + suspense-фолбэки для разовой загрузки в hero-сегменте.

## Мониторинг

| Среда | Инструмент |
|---|---|
| Dev | `stats-gl` overlay (FPS, draw calls, GPU memory) |
| Dev | `<Perf>` от `r3f-perf` (опционально, тяжелее) |
| Prod | `web-vitals` отправляет LCP/INP/CLS в Cloudflare Analytics или собственный endpoint |
| Prod | Sentry performance — длинные задачи и ошибки WebGL контекста |

## Доступность

- `prefers-reduced-motion: reduce` → fallback (см. выше). Это не «опция», это hard switch.
- Все overlay-тексты дублируются в DOM (не только в Troika), чтобы скрин-ридеры читали.
- Контраст overlay-текста проверяется на инвертированной палитре тоже.
- Tab-навигация работает по DOM-порядку независимо от 3D-сегмента.
- Skip-link «To information base» в начале страницы для быстрого пропуска нарратива.

## Источники
- R3F scaling performance — <https://r3f.docs.pmnd.rs/advanced/scaling-performance>
- Codrops: «Building efficient three.js scenes» — <https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/>
- Utsubo: 100 three.js best practices — <https://www.utsubo.com/blog/threejs-best-practices-100-tips>
- Digital Applied: Core Web Vitals 2026 — <https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide>
