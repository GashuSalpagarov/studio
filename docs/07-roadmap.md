# 07. Roadmap (этапы реализации)

## TL;DR
Десять этапов, без сроков, в порядке зависимости: setup → hero/compress → spline/camera → wormhole → stage scenes → infobase + inversion → mobile fallback → performance pass → visual regression + a11y → deploy. Каждый этап имеет приёмочные критерии, чтобы не уезжать вперёд с нерабочей основой.

## 1. Setup
- Инициализация проекта: Next.js 15 (App Router), TypeScript strict, Biome.
- Подключить React 19, R3F 9.6+, drei 10.7+, three r170+, postprocessing, `r3f-scroll-rig`.
- Поднять Lenis (`<ReactLenis root>`), привязать ScrollTrigger через `lenis.on('scroll', ScrollTrigger.update)` и `gsap.ticker.add(...)`.
- Smoke test: пустой `<GlobalCanvas>` рендерит fullscreen цвет, страница скроллится с инерцией Lenis, ScrollTrigger логирует прогресс.
- Приёмка: пустая страница с canvas, Lighthouse Perf > 95 на пустой сцене.

## 2. Hero + compress to dot
- Статичный hero-DOM (заголовок, лид).
- WebGL-точка как простой `<Sphere>` с emissive-материалом.
- FLIP-сжатие hero через GSAP + matched-position на WebGL-точку (см. [04-3d-techniques.md](./04-3d-techniques.md)).
- Свап DOM-точка ↔ WebGL-точка по триггеру лейбла.
- Приёмка: на прогрессе 0.10 точка стабильно на экране, без джиттера, переход беспрерывен по визуалу.

## 3. Spline path & camera
- `CatmullRomCurve3` с 8–12 контрольными точками; centripetal параметризация.
- Camera follow через `getPointAt`/`getTangentAt` в `useFrame`.
- Debug helper: drei `<Line>` по `curve.getPoints(200)`, тоггл в dev (`?debug=1`).
- Приёмка: точка движется по линии 0.10–0.20 без рывков; разворот камеры на сегменте ≥ 90° корректный.

## 4. Wormhole shader + particle streaks (один сегмент)
- `TubeGeometry` вдоль части сплайна; ShaderMaterial с UV-смещением.
- `InstancedMesh` particle streaks (200–500 инстансов).
- Post-FX: Bloom + ChromaticAberration + radial blur (минимально подобранные параметры).
- Приёмка: один туннельный сегмент работает end-to-end, FPS 60+ на десктопе референса (Apple M-серии / NVidia mid-range).

## 5. Stage scenes 1–3
- Между туннельными сегментами — три сцены этапов («Discover», «Design», «Build»).
- Каждая — отдельный `<group visible={...}>` с visibility по диапазону прогресса.
- Контент сцен: упрощённые абстрактные композиции, мульти-instanced; без тяжёлой геометрии.
- Приёмка: переходы wormhole↔stage без черного flash; общий бюджет (см. [05-performance.md](./05-performance.md)) держится.

## 6. Information base + inversion loop
- Финальная DOM-секция: услуги, CTA, форма (server action в Next.js).
- WebGL-сцена в idle-режиме (camera drift).
- Inversion effect: финальный `inversion.frag` с `uInvert`, GSAP tween 0.92→1.00.
- Lenis `infinite: true`; либо clone-loop как fallback.
- DOM-цвета через `@property` synced с `uInvert`.
- Приёмка: при втором обороте сцена идёт в инвертированной палитре; CTA-кнопки кликабельны на любом сегменте.

## 7. Mobile fallback
- Pre-mount детект (см. [05-performance.md](./05-performance.md)).
- Альтернативный layout: статичные постеры этапов, CSS-параллакс, упрощённый hero.
- Никаких WebGL-вызовов в mobile-ветке (включая отсутствие `<Canvas>` в дереве).
- Приёмка: на iPhone 12 Safari страница ≤ 1.5 MB initial, скролл без 3D, контраст и доступность ОК.

## 8. Performance pass
- Перевод GLB → Draco + KTX2 через `gltf-transform optimize`.
- Adaptive DPR через `<PerformanceMonitor>`.
- Удаление неиспользуемых material variants, unify shaders.
- `web-vitals` шлют LCP/INP/CLS в endpoint; пороги — см. [05-performance.md](./05-performance.md).
- Приёмка: метрики попадают в зелёные зоны на референсном десктопе и на мобильном fallback.

## 9. Visual regression + a11y
- Playwright: набор «scroll-кадров» (0.05, 0.10, 0.30, 0.50, 0.70, 0.85, 0.95) с pixel-diff.
- Доступность: tab-обход DOM, контраст в обеих палитрах, `prefers-reduced-motion` honored, skip-link.
- Lighthouse a11y > 95.
- Приёмка: все scroll-кадры стабильны (≤ 0.5% diff), a11y-checklist пройден.

## 10. Deploy
- Cloudflare Pages (Next.js через `@cloudflare/next-on-pages` или edge runtime, в зависимости от server action'ов).
- R2: `assets/models/`, `assets/textures/`.
- Stream/Images: видеотекстуры (если появятся) и постеры fallback.
- HTTP/2 + Brotli включены by default; `Cache-Control` для GLB/KTX2 — `immutable, max-age=31536000`.
- Приёмка: production-LCP < 2.5s по реальным замерам с трёх регионов.

## Зависимости

```
1 → 2 → 3 → 4 → 5 → 6
                       ↓
                       7  (mobile)  — параллельно с 5–6
                       ↓
                       8 → 9 → 10
```

Этапы 1–6 строго последовательны: каждый держит сценарный сегмент, который проверяется в master-таймлайне. Этап 7 можно вести параллельно начиная с 5. Этапы 8–10 — финальный pass.

## Источники
- `r3f-scroll-rig` — <https://github.com/14islands/r3f-scroll-rig>
- Codrops «Cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Cloudflare Pages + Next on Pages — общая документация платформы (см. [06-references.md](./06-references.md), секция Стек-документации)
