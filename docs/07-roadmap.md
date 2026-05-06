# 07. Roadmap (этапы реализации)

## TL;DR
Двенадцать этапов, без сроков, в порядке зависимости: setup → 5 сцен линии → mobile-версия → внутренние страницы → performance + a11y → deploy. Этап 0 (setup) сделан. Сейчас идёт подготовка к Этапу 1 (Сцена 1: Hero → точка), который разбит на 7 микро-этапов.

## Этап 0. Setup — Сделано

Что зафиксировано в проекте:

- Next.js 16.2.4 (App Router), React 19.2.5, TypeScript 6.0.3 strict.
- Зависимости: Lenis 1.3.23, GSAP 3.15, three 0.184, R3F 9.6.1, drei 10.7.7, postprocessing 3.0.4, `@14islands/r3f-scroll-rig` 8.15, `@gsap/react` 2.1.
- Менеджер пакетов: pnpm 10.33.x.
- Линт/формат: Biome 2.4.x.
- Структура: `app/{layout,page,providers,globals.css}` (placeholder, без логики), `r3f/GlobalCanvas.tsx` (пустой Canvas, fixed), `lib/scroll/lenis.ts`, `lib/utils/cn.ts` (заготовки с TODO).
- Конфиги: `tsconfig`, `biome`, `next.config`, `.gitignore`.
- Git инициализирован, один коммит.
- `reactCompiler` в `next.config` закомментирован — включится позже (см. [01-stack.md](./01-stack.md)).

Приёмка пройдена: пустая страница с canvas рендерится, dev-сервер стартует без ошибок.

## Этап 1. Сцена 1: Hero → точка

Семь микро-этапов от статичного DOM до WebGL-точки, готовой к движению.

### 1.1 Hero DOM
- Статичный экран с типографикой (заголовок, лид) и точкой как DOM-элементом в композиции.
- Стили — CSS Modules + design tokens из `globals.css` (`--bg`, `--fg`, шрифт, скейл).
- Никаких анимаций, никаких импортов из R3F.
- Приёмка: страница `/` рендерит hero c точкой в DOM, скролл нативный, Lighthouse a11y OK.

### 1.2 Lenis монтирование, debug scroll progress
- Поднять `<ReactLenis root>` в `providers.tsx`, `infinite: true` (для будущего loop'а).
- Завести `lib/scroll/progress.ts` с ref-singleton'ом и подписку `lenis.on('scroll', ...)`.
- Dev-overlay (тихий уголок) с печатью текущего progress'а — для визуальной отладки.
- Приёмка: при скролле числовое значение progress'а ровно меняется 0..1, плавный inertia ощущается.

### 1.3 GSAP + ScrollTrigger обвязка, master timeline scaffold
- `gsap.registerPlugin(ScrollTrigger)`, привязка `lenis.on('scroll', ScrollTrigger.update)` и `gsap.ticker.add(...)`.
- Master timeline в client-компоненте главной с пятью лейблами по сценам ([02-architecture.md](./02-architecture.md)).
- Тестовый tween (например, opacity hero-заголовка на 0.00–0.05) — для проверки работы pipeline'а.
- Приёмка: лейблы доступны через `tl.labels`, тестовый tween идёт строго по scrub'у.

### 1.4 R3F GlobalCanvas — desktop-only mount, GPU detect
- В `r3f/GlobalCanvas.tsx` добавить логику pre-mount детекта (см. [05-performance.md](./05-performance.md)): viewport, mobile UA, Save-Data, GPU tier через `detect-gpu`.
- Если триггер сработал — `<Canvas>` не рендерится, остаётся только DOM/SVG-разметка.
- DPR cap, `performance={{ min: 0.5 }}`, `<PerformanceMonitor>` подключён, но с пустыми обработчиками.
- Приёмка: на desktop canvas видно (например, дебажный фон-плоскость), на узком viewport / при `Save-Data` — нет canvas.

### 1.5 WebGL-точка появляется в фиксированной позиции
- Простой `<Sphere>` или billboard-quad с emissive-материалом в фиксированной точке в мире.
- Позиция выбрана так, чтобы при дефолтной камере точка была в центре экрана.
- `pointer-events: none` на canvas — клики проходят к DOM.
- Приёмка: точка стабильно в центре, не дёргается при ресайзе.

### 1.6 FLIP-swap: DOM-точка ↔ WebGL-точка с matched position
- В фазе 0.10–0.20 GSAP сжимает DOM-hero (FLIP). К концу 0.20 DOM-точка по координатам совпадает с WebGL-точкой.
- `useFrame` каждый кадр держит DOM↔WebGL координаты совпадающими через `getBoundingClientRect` + `unproject` ([04-3d-techniques.md](./04-3d-techniques.md)).
- Один tween переключает `dom.opacity 1→0` и `mesh.material.opacity 0→1`.
- Приёмка: на прогрессе ~0.20 swap визуально незаметен, нет «прыжка» между DOM- и WebGL-точкой.

### 1.7 Точка живёт после swap, готова к Сцене 2
- После swap WebGL-точка остаётся видимой и слегка идлит (можно дать лёгкий sin/cos drift).
- Передача `uProgress` в материал точки через `useFrame`.
- Приёмка: на прогрессе 0.20–0.40 точка остаётся, не моргает; готова к подключению движения по линии.

## Этап 2. Сцена 2: Инструменты (Услуги)

- Блок «Услуги» в DOM: типографика, плейсхолдеры 6 направлений, карточки.
- Линия в WebGL: `Line2` / `MeshLine` по сегменту curve'а 0.20–0.40.
- Прогресс отрисовки линии — uniform `uDrawProgress` или `dashOffset`.
- Точка движется по линии (`curve.getPointAt(t)`).
- Визуальная метафора «инструменты» (декорации возле линии) — дизайн позже; на этом этапе — упрощённый плейсхолдер.
- Pinned-секция блока «Услуги» через ScrollTrigger.
- Приёмка: на 0.20–0.40 линия рисуется по мере скролла, точка движется вдоль неё.

## Этап 3. Сцена 3: Продукты (Портфолио)

- Блок «Портфолио» в DOM: карточки 4–6 кейсов (placeholder).
- Продолжение линии в сегменте 0.40–0.60 с узлами-«продуктами» на ней.
- Hover/focus на карточке кейса подсвечивает соответствующий узел.
- Приёмка: линия проходит сквозь узлы, узлы интерактивны на DOM-уровне, корректные ARIA-метки.

## Этап 4. Сцена 4: Парный путь (Подход)

- Блок «Подход» в DOM.
- Линия раздваивается на 0.60–0.80: к основной добавляется параллельная.
- Две линии сходятся к концу сегмента (метафора совместной работы).
- Приёмка: парный путь без артефактов в Line2; обе линии корректно рисуются по прогрессу.

## Этап 5. Сцена 5: Замыкание + CTA-инверсивный мост

- Блок CTA в DOM: финальная фраза, кнопка контакта.
- Линия замыкается на 0.80–1.00.
- Wipe-инверсия на 0.92–1.00 через clip-path circle expanding из CTA-зоны + `@property` для DOM-tokens ([04-3d-techniques.md](./04-3d-techniques.md)).
- Lenis `infinite: true` + clone-mount Hero в DOM-конце для бесшовного teleport'а.
- Кольцо прогресса в углу страницы (SVG, fixed, layout-level).
- Приёмка: на втором обороте Hero видно в инвертированной палитре, переход бесшовный, CTA-кнопки кликабельны.

## Этап 6. Per-scene route transitions

- Хук `useActiveScene()` отдаёт текущую сцену.
- Компонент `<RouteTransition fromScene toRoute>`: оборачивает клики по карточкам услуг и кейсов, играет анимацию перехода и инициирует `router.push`.
- 2–3 паттерна перехода (по одному на сцену 2 и сцену 3 минимум). Конкретные паттерны — на дизайн-этапе.
- Приёмка: клик из «Услуг» и из «Продуктов» дают визуально разные переходы; navigation работает; нет утечек RAF/таймлайнов.

## Этап 7. Mobile-версия

- SVG-вариант линии (`<path>` + `stroke-dashoffset`), сэмплируется из той же `CatmullRomCurve3` в JS.
- Pre-mount детект отключает `<Canvas>`, но Lenis + GSAP + SVG-линия работают.
- Инверсия на CTA через clip-path overlay (CSS) — без шейдера.
- Loop через Lenis `infinite: true` + DOM-clone Hero.
- Кольцо прогресса работает идентично десктопу.
- Приёмка: на iPhone 12 Safari страница ≤ 1.5 MB initial, сценарий проходится, loop+инверсия работают, FPS-метрика DOM-анимаций ≥ 50.

## Этап 8. Reduced motion

- Detect `prefers-reduced-motion: reduce` на верхнем уровне layout.
- Ветка: статичная страница, Lenis выключен, ScrollTrigger не монтируется, линия скрыта или статична, инверсия выключена, loop отсутствует.
- Все 5 блоков читаются как обычные секции с нативным скроллом.
- Приёмка: при включённом OS-флаге страница не анимирована, весь контент доступен.

## Этап 9. Внутренние страницы

- `/services` (каталог), `/services/[slug]` ×6 (детальные).
- `/cases` (каталог), `/cases/[slug]` (детальные, 4–6 топовых).
- `/approach` (детальная), `/contact` (форма через Next.js server action).
- Дизайн — продуктовый, белый фон, без инверсии, без сложных WebGL-сцен.
- GlobalCanvas переключается в `mode='static'` или `mode='off'`.
- Кольцо прогресса — опционально (по странице).
- Приёмка: все роуты работают; lighthouse perf > 90; navigation между ними не пересоздаёт WebGL-контекст.

## Этап 10. Performance pass + a11y

- Adaptive DPR через `<PerformanceMonitor>` (полные обработчики).
- Перевод GLB → Draco + KTX2 через `gltf-transform optimize` (если появятся модели).
- Удаление неиспользуемых material variants, unify shaders.
- `web-vitals` шлют LCP/INP/CLS в endpoint; пороги — см. [05-performance.md](./05-performance.md).
- Доступность: tab-обход DOM, контраст в обеих палитрах, `prefers-reduced-motion` honored, skip-link, ARIA на интерактивах.
- Lighthouse a11y > 95.
- Playwright: набор «scroll-кадров» (0.05, 0.20, 0.40, 0.60, 0.80, 0.95) с pixel-diff.
- Приёмка: метрики в зелёных зонах на референсном десктопе и мобильном; visual regression стабильна.

## Этап 11. Deploy

- Cloudflare Pages (Next.js через `@cloudflare/next-on-pages` или edge runtime, в зависимости от server action'ов).
- R2: `assets/models/`, `assets/textures/`.
- Stream/Images: видеотекстуры (если появятся) и постеры fallback.
- HTTP/2 + Brotli включены by default; `Cache-Control` для GLB/KTX2 — `immutable, max-age=31536000`.
- Приёмка: production-LCP < 2.5s по реальным замерам с трёх регионов.

## Зависимости

```
0 (✓) → 1 → 2 → 3 → 4 → 5 → 6
                              ↓
                              7 (mobile) — параллельно с 5–6
                              ↓
                              8 (reduced motion)
                              ↓
                              9 (внутренние) — параллельно с 5–6
                              ↓
                              10 → 11
```

Этапы 1–5 строго последовательны: каждый держит сценарный сегмент. Этапы 7 и 9 можно начинать параллельно с 5. Этапы 10–11 — финальный pass.

## Источники
- `r3f-scroll-rig` — <https://github.com/14islands/r3f-scroll-rig>
- Codrops «Cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Cloudflare Pages + Next on Pages — общая документация платформы (см. [06-references.md](./06-references.md), секция Стек-документации)
