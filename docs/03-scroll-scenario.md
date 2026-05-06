# 03. Сценарий скролла

## TL;DR
Прогресс скролла 0..1 разбит на восемь сегментов: статичный hero, сжатие в точку, полёт по сплайну, три пары wormhole↔stage, информационная база и петля с инверсией. Каждый сегмент диктует, какие DOM-секции видны и какие uniform'ы скармливаются R3F.

## Базовая раскладка

| Range | Sequence | Что происходит | DOM | WebGL |
|---|---|---|---|---|
| 0.00 – 0.05 | Hero static | Статичный заголовок и вступление; canvas прогревается | `#hero` visible, opacity 1 | preload assets, dot ждёт в стартовой точке камеры |
| 0.05 – 0.10 | Compress to dot | Hero сжимается в точку через FLIP; в финале swap DOM-точки на WebGL-точку | `#hero` opacity 1→0, заголовок схлопывается | DOM-точка позиционируется поверх WebGL-точки, swap по событию |
| 0.10 – 0.20 | Travel along line | Точка движется по сплайну, камера летит рядом | минимальный nav, прозрачный overlay | `CatmullRomCurve3.getPointAt`, `getTangentAt` для камеры |
| 0.20 – 0.40 | Wormhole 1 → Stage 1 | Влёт в туннель, выход в сцену этапа «Discover» | overlay-текст «Discover» fade-in | tube + particle streaks + camera fly-through; на выходе — сцена этапа 1 |
| 0.40 – 0.60 | Wormhole 2 → Stage 2 | Стадия «Design» | overlay-текст «Design» | новый сегмент туннеля + новая сцена-этап |
| 0.60 – 0.80 | Wormhole 3 → Stage 3 | Стадия «Build» | overlay-текст «Build» | сегмент туннеля + сцена-этап |
| 0.80 – 0.92 | Information base | Финальная инфо-секция, CTA, контакты | плотный DOM поверх canvas | сцена замедляется, камера фиксируется, post-FX dim |
| 0.92 – 1.00 | Inversion loop | Цвета инвертируются, скролл петляет | overlay invert; цвета DOM через `@property` | uniform `uInvert` 0→1; на 1.0 → reset камеры в стартовую точку |

Сегменты смыкаются без пауз: конец одного = старт следующего. Цифры — рекомендация, точные границы фиксируются при реализации мастер-таймлайна (см. [02-architecture.md](./02-architecture.md)).

## Подробно по сегментам

### 0.00 – 0.05 — Hero static
- DOM: заголовок студии, краткий лид, нав. Никаких animations, кроме CSS-fade при первом монтировании.
- WebGL: сцена уже инициализирована, материал точки готов, но точка либо за камерой, либо невидима. На фоне может крутиться лёгкий ambient particle field (низкочастотный, без bloom).
- Uniform feed: `uProgress = 0`, `uInvert = 0`.

### 0.05 – 0.10 — Compress to dot
- DOM: контейнер hero сжимается через FLIP к финальной координате будущей WebGL-точки. Размер схлопывается до радиуса 4–8 px на экране.
- WebGL: точка (sphere small или billboard quad) уже в кадре, но скрыта (`material.opacity = 0`). На последнем кадре сегмента DOM-точка скрывается, WebGL-точка проявляется в той же экранной позиции (см. [04-3d-techniques.md](./04-3d-techniques.md), DOM→WebGL).
- Материалы: emissive sphere + faint bloom.

### 0.10 – 0.20 — Travel along line
- DOM: верхний nav в минимальной форме; контента нет.
- WebGL: камера получает позицию из `CatmullRomCurve3.getPointAt(t)`, ориентацию — из `getTangentAt(t)`. Точка-протагонист идёт чуть впереди камеры (offset вдоль тангенса).
- Линия маршрута может быть нарисована как `Line2` с лёгким glow.
- Перед входом в туннель — короткая deceleration в шейдере туннеля (uniform `uEnter`).

### 0.20 – 0.40 — Wormhole 1 → Stage 1
- DOM: оверлей с текстом названия этапа («Discover»). Fade-in на 0.20–0.22, fade-out на 0.36–0.38.
- WebGL:
  - 0.20–0.30: камера внутри `TubeGeometry`, материал смещает UV по `uTime + uProgress`, частицы-стрики проносятся вдоль оси трубки.
  - 0.30–0.40: камера выходит из туннеля в сцену этапа. Сцена этапа — отдельная подгруппа `<group visible={...}>`, активируемая по диапазону прогресса.
- Сцена этапа 1 (Discover): абстрактный visual о ресёрче — узлы-сетка, поисковые лучи, легко-читаемая глубина.

### 0.40 – 0.60 — Wormhole 2 → Stage 2
- Симметрично сегменту 1.
- Сцена этапа 2 (Design): объёмные плоскости, sketch-grid, моушн-ритм.

### 0.60 – 0.80 — Wormhole 3 → Stage 3
- Симметрично.
- Сцена этапа 3 (Build): тех-морфология — экструзии, instanced gears/blocks, тёплые акценты.

### 0.80 – 0.92 — Information base
- DOM: главный контент — описание услуг, CTA-кнопка, контакты, форма (server action в Next.js).
- WebGL: сцена идёт в режим idle — slow camera drift, post-FX dim (Bloom intensity ↓, Vignette ↑).
- Этот сегмент должен быть «тяжёлым» для DOM и лёгким для GPU, чтобы CTA не лагал.

### 0.92 – 1.00 — Inversion loop
- WebGL: финальный effect-проход смешивает кадр с инверсией по uniform `uInvert` 0→1 (см. [04-3d-techniques.md](./04-3d-techniques.md)).
- DOM: цвета DOM меняются через `@property --bg`, `--fg` в keyframes, привязанных к ScrollTrigger.
- Loop: в `Lenis({ infinite: true })` или ручной clone-based loop. На прогрессе 1.0 камера и сцена сбрасываются в стартовое состояние, но `uInvert` остаётся 1; следующий «круг» идёт в инвертированной палитре.

## Передача параметров между DOM и WebGL

| Параметр | Источник | Куда идёт |
|---|---|---|
| `uProgress` (0..1 глобально) | Lenis | `useFrame` → uniforms всех материалов сцены |
| `uSegmentProgress` (0..1 внутри сегмента) | derived из `uProgress` | материалы конкретного сегмента (туннель, stage) |
| `uInvert` (0..1) | GSAP tween на ScrollTrigger 0.92→1.00 | финальный inversion effect, `@property` для DOM |
| `cameraT` | derived из `uProgress` для travel/wormhole диапазонов | `CatmullRomCurve3.getPointAt(cameraT)` |
| `stageVisible` | discrete по диапазону | `<group visible={...}>` сцен этапов |

## Источники
- Codrops: scroll-narrative с протагонистом — <https://tympanus.net/codrops/2026/04/28/more-than-a-portfolio-building-a-scroll-driven-3d-world-with-something-to-say/>
- Codrops: «3D scroll-driven text animations» — <https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/>
- Codrops: «Scroll-revealed WebGL gallery» — <https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/>
