# 02. Архитектура

## TL;DR
Один fixed-canvas R3F через всё приложение — живёт в `app/layout.tsx` и переживает route changes между главной и внутренними страницами. На главной сцена линии активна; на внутренних — отключена либо минимальна. DOM-секции скроллятся поверх; единственный источник скролла — Lenis, к которому подключены ScrollTrigger и `useFrame`. Прогресс передаётся в R3F через `useRef`-singleton, а не state. Над сценой — единый master-timeline GSAP с пятью лейблами по сценам линии. DOM↔WebGL координаты согласуются через `r3f-scroll-rig` либо вручную через `getBoundingClientRect` + `Vector3.unproject`. Per-scene route transitions: разные паттерны перехода в зависимости от сцены, из которой инициирован переход.

## Multi-page и GlobalCanvas

GlobalCanvas монтируется один раз в `app/layout.tsx` и живёт всё время существования приложения. Это критично: при навигации Next.js между `/`, `/services/[slug]`, `/cases/[slug]` WebGL-контекст не пересоздаётся, что:
- сохраняет состояние сцены при route transitions;
- даёт возможность анимировать переходы поверх живого canvas (per-scene transitions, см. ниже);
- избегает `WebGL context lost` при навигации.

На детальных страницах (`/services/[slug]`, `/cases/[slug]`, `/approach`, `/contact`, и каталоги) сцена линии **отключается** или работает в минимальном режиме (например, статичный фон или одиночный элемент). Управляется флагом из контекста роута: главная — `mode='hero-line'`, внутренние — `mode='static'` или `mode='off'`.

```tsx
// app/layout.tsx
<body>
  <LenisProvider>
    <GlobalCanvas /> {/* fixed, переживает route changes */}
    <main>{children}</main>
    <ProgressRing /> {/* fixed, угол */}
  </LenisProvider>
</body>
```

## Single fixed canvas

Canvas рендерится один раз и живёт всё время существования приложения. DOM-секции скроллятся над ним обычным потоком.

```css
.global-canvas {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
```

Альтернатива — `z-index: -1`, но тогда невозможно ставить WebGL-эффекты поверх DOM. Мы держим canvas сверху с `pointer-events: none`, а DOM-секции — на `position: relative; z-index: 2` с собственным background, чтобы перекрывать canvas там, где это нужно.

### Два варианта реализации

**Вариант A — `r3f-scroll-rig` (рекомендуется).** GlobalCanvas-компонент монтируется один раз в layout; компоненты сцены подключаются через `<UseCanvas>`. Под капотом — `tunnel-rat`, поэтому WebGL-граф не пересоздаётся при навигации Next.js — критично для multi-page структуры.

```
app/
  layout.tsx                  // <GlobalCanvas /> + Lenis provider
  page.tsx                    // главная: 5 блоков
  services/page.tsx           // каталог услуг
  services/[slug]/page.tsx    // детальная услуги
  cases/page.tsx              // каталог кейсов
  cases/[slug]/page.tsx       // детальная кейса
  approach/page.tsx           // подход
  contact/page.tsx            // контакты
components/
  scenes/
    Hero.tsx                  // DOM-блок
    HeroWebGL.tsx             // <UseCanvas> с точкой
```

**Вариант B — vanilla R3F.** Один `<Canvas eventSource={domRoot} eventPrefix="client" />` в layout, root-компонент сцены управляется через Zustand-стор прогресса.

Берём A; B остаётся как fallback, если `r3f-scroll-rig` начнёт мешать конкретной сцене.

## Single source of truth для скролла

Lenis — единственный, кто двигает скролл. ScrollTrigger переиспользует его тики, GSAP-ticker гонит RAF.

```js
const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, infinite: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```

Эта обвязка живёт один раз — в client-провайдере (`<LenisProvider>` или `<ReactLenis root>` от `lenis/react`). `infinite: true` нужен для loop'а главной (см. [04-3d-techniques.md](./04-3d-techniques.md), раздел Loop).

На внутренних страницах `infinite` следует выключать через `lenis.options` или перемонтирование провайдера, чтобы поведение скролла оставалось привычным.

## Передача progress в R3F

Главное правило: **никаких `setState` на каждый скролл-тик.** Иначе React-дерево рендерится 60 раз в секунду.

Шаблон:

```tsx
// lib/scroll/progress.ts
export const scrollProgress = { current: 0 }; // ref-singleton

// в client-обвязке Lenis:
lenis.on('scroll', (e) => { scrollProgress.current = e.progress; });

// в R3F-компоненте:
useFrame(() => {
  material.uniforms.uProgress.value = scrollProgress.current;
});
```

Альтернатива — `useRef` + контекст; семантика та же. Для Zustand: `subscribe` без хука либо `useStore.getState()` внутри `useFrame`.

## Master timeline (5 сцен линии)

Один таймлайн на всю главную, лейблы соответствуют пяти сегментам из [03-scroll-scenario.md](./03-scroll-scenario.md):

```js
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: 'body',
    start: 0,
    end: 'max',
    scrub: true,
  },
});

tl.addLabel('hero',        0.00)  // Hero → точка
  .addLabel('services',    0.20)  // Услуги → инструменты
  .addLabel('portfolio',   0.40)  // Портфолио → продукты
  .addLabel('approach',    0.60)  // Подход → парный путь
  .addLabel('cta',         0.80)  // CTA → замыкание + инверсия
  .addLabel('loop',        1.00); // мост назад на hero
```

GSAP-tween'ы DOM-элементов привязываются к лейблам. WebGL-уровень читает прогресс не через таймлайн, а напрямую из Lenis — таймлайн отвечает за DOM, ScrollTrigger-pinning и инверсивные tween'ы на CTA.

Master-timeline монтируется только на главной; на детальных страницах он не нужен.

## Pinned-секции

Каждая сцена линии должна «держаться» на экране, пока прогресс протекает через сегмент:

```js
ScrollTrigger.create({
  trigger: '#scene-services',
  start: 'top top',
  end: '+=200%',
  pin: true,
  scrub: true,
});
```

`pin: true` обязателен, иначе DOM-overlay уезжает раньше WebGL-сегмента.

## DOM ↔ WebGL координаты

Два паттерна:

**Паттерн A — `r3f-scroll-rig` `<UseCanvas>` + `<ScrollScene>`.** Привязка DOM-элемента к WebGL-меша по bounding box, обновление автоматическое.

```tsx
<div ref={ref} className="hero-anchor" />
<UseCanvas>
  <ScrollScene track={ref}>
    {(props) => <HeroDot {...props} />}
  </ScrollScene>
</UseCanvas>
```

**Паттерн B — вручную.** Для FLIP-сжатия hero в точку, когда нужен полный контроль:

```ts
const rect = el.getBoundingClientRect();
const ndcX =  (rect.left + rect.width / 2) / window.innerWidth  * 2 - 1;
const ndcY = -(rect.top  + rect.height / 2) / window.innerHeight * 2 + 1;
const v = new Vector3(ndcX, ndcY, 0.5).unproject(camera);
mesh.position.copy(v);
```

Подробнее про matched-canvas-position transition — в [04-3d-techniques.md](./04-3d-techniques.md).

## Per-scene route transitions

Требование: при клике на услугу или кейс с разных сцен главной — **разные анимации перехода**. Каждая сцена «впадает» во внутреннюю страницу по-своему.

Концептуально:
- Текущая активная сцена (определяется по диапазону `scrollProgress.current` или по последнему пройденному лейблу) фиксируется в момент клика.
- Запускается «локальная» анимация, специфичная для сцены: например, из «Инструментов» — линия переходит в «расширение тулзы»; из «Продуктов» — точка-кейс «вырастает» в обложку детальной страницы.
- Параллельно стартует роутинг Next.js. WebGL-сцена остаётся живой за счёт persistent GlobalCanvas; на новой странице она переходит в `mode='static'` или `mode='off'`.
- На внутренней странице — короткое завершение анимации (resolve), после чего DOM детальной страницы доступен.

Конкретные паттерны (по сцене) фиксируются на этапе визуального дизайна. Здесь архитектура:
- хук `useActiveScene()` возвращает текущую сцену (`'hero' | 'services' | 'portfolio' | 'approach' | 'cta'`);
- компонент `<RouteTransition fromScene={...} toRoute={...}>` владеет анимацией, синхронной с `router.push`;
- View Transitions API можно использовать как опциональный slow-path; основной путь — GSAP + canvas.

## Структура папок

```
app/
  layout.tsx                  // GlobalCanvas + ReactLenis root + ProgressRing
  page.tsx                    // главная: 5 блоков
  services/page.tsx
  services/[slug]/page.tsx
  cases/page.tsx
  cases/[slug]/page.tsx
  approach/page.tsx
  contact/page.tsx
  globals.css                 // design tokens, @property для инверсии
  providers.tsx               // LenisProvider, theme provider
components/
  blocks/                     // 5 блоков главной (Hero, Services, Portfolio, Approach, CTA)
  pages/                      // компоненты внутренних страниц
  layout/
    GlobalCanvas.tsx          // живёт в layout
    ProgressRing.tsx          // SVG-кольцо прогресса
    LenisProvider.tsx
  transitions/
    RouteTransition.tsx       // per-scene transitions
r3f/
  GlobalCanvas.tsx            // root canvas (уже создан)
  Scene.tsx                   // root сцены линии
  Line.tsx                    // главная линия (Three.js Line / MeshLine)
  scenes/                     // 5 сцен линии
    HeroDot.tsx
    Tools.tsx
    Products.tsx
    PairedPath.tsx
    Closure.tsx
  effects/
    PostFX.tsx
    Inversion.tsx             // wipe-инверсия для CTA
shaders/
  line.vert/.frag
  inversion.frag
lib/
  scroll/
    lenis.ts                  // уже создан
    progress.ts               // ref-singleton
    triggers.ts
  three/
    curves.ts
    domToWebGL.ts             // unproject helpers
  perf/
    detect.ts
  utils/
    cn.ts                     // уже создан
assets/
  models/
  textures/
  fonts/
```

## Источники
- R3F Canvas options: <https://r3f.docs.pmnd.rs/api/canvas>
- Codrops: «How to build cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Builder.io: WebGL scroll animation — <https://www.builder.io/blog/webgl-scroll-animation>
- `r3f-scroll-rig` — <https://github.com/14islands/r3f-scroll-rig>
- View Transitions API — <https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API>
