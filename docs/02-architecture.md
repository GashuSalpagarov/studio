# 02. Архитектура

## TL;DR
Один fixed-canvas R3F через всю страницу; DOM-секции скроллятся поверх; единственный источник скролла — Lenis, к которому подключены ScrollTrigger и `useFrame`. Прогресс передаётся в R3F через `useRef`, а не state. Над сценой — единый master-timeline GSAP с лейблами, на DOM — pinned-секции для wormhole. DOM↔WebGL координаты согласуются через `r3f-scroll-rig` либо вручную через `getBoundingClientRect` + `Vector3.unproject`.

## Single fixed canvas

Canvas рендерится один раз и живёт всё время существования страницы. DOM-секции скроллятся над ним обычным потоком.

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

**Вариант A — `r3f-scroll-rig` (рекомендуется).** GlobalCanvas-компонент монтируется один раз в layout; компоненты сцены подключаются через `<UseCanvas>`. Под капотом — `tunnel-rat`, поэтому WebGL-граф не пересоздаётся при навигации Next.js.

```
app/
  layout.tsx            // <GlobalCanvas /> + Lenis provider
  page.tsx              // DOM-секции
components/
  scenes/
    Hero.tsx            // DOM
    HeroWebGL.tsx       // <UseCanvas>{/* мешы */}</UseCanvas>
```

**Вариант B — vanilla R3F.** Один `<Canvas eventSource={domRoot} eventPrefix="client" />` в layout, root-компонент сцены управляется через Zustand-стор прогресса.

```tsx
<Canvas
  eventSource={() => document.getElementById('root')!}
  eventPrefix="client"
  dpr={[1, 2]}
  gl={{ antialias: false, powerPreference: 'high-performance' }}
>
  <SceneRoot />
</Canvas>
```

Берём A, B остаётся как fallback, если `r3f-scroll-rig` начнёт мешать конкретной сцене.

## Single source of truth для скролла

Lenis — единственный, кто двигает скролл. ScrollTrigger переиспользует его тики, GSAP-ticker гонит RAF.

```js
const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```

Эта обвязка живёт один раз — в client-провайдере (`<LenisProvider>` или `<ReactLenis root>` от `lenis/react`).

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

Альтернатива — `useRef` + контекст, но семантика та же: значение читается через `.current` и не вызывает реренда. Для Zustand: использовать `subscribe` без хука, либо `useStore.getState()` внутри `useFrame`.

## Master timeline

Один таймлайн на всю сцену, лейблы соответствуют сегментам из [03-scroll-scenario.md](./03-scroll-scenario.md):

```js
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: 'body',
    start: 0,
    end: 'max',
    scrub: true,
  },
});

tl.addLabel('hero',       0.00)
  .addLabel('compress',   0.05)
  .addLabel('travel',     0.10)
  .addLabel('wormhole1',  0.20)
  .addLabel('stage1',     0.30)
  .addLabel('wormhole2',  0.40)
  // ...
  .addLabel('infoBase',   0.80)
  .addLabel('invertLoop', 0.92);
```

GSAP-tween'ы DOM-элементов привязываются к лейблам. WebGL-уровень читает прогресс не через таймлайн, а напрямую из Lenis (см. выше) — таймлайн отвечает только за DOM и ScrollTrigger-pinning.

## Pinned-секции для wormhole

Каждый wormhole-этап нужно «удержать» на экране, пока прогресс протекает через сегмент:

```js
ScrollTrigger.create({
  trigger: '#wormhole-1',
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

## Структура папок

```
app/
  layout.tsx               // GlobalCanvas + ReactLenis root
  page.tsx                 // DOM-секции
  globals.css
components/
  Hero.tsx
  Stage.tsx
  InfoBase.tsx
  layout/
    GlobalCanvas.tsx
    LenisProvider.tsx
r3f/
  Scene.tsx                // root sceneа
  Camera.tsx               // CatmullRom path follower
  Wormhole.tsx
  ParticleStreaks.tsx
  StageScene.tsx
  effects/
    PostFX.tsx             // Bloom + CA + Vignette + Noise
    Inversion.tsx          // финальный uInvert effect
shaders/
  wormhole.vert/.frag
  inversion.frag
  particle-streak.vert/.frag
lib/
  scroll/
    lenis.ts
    progress.ts
    triggers.ts
  three/
    curves.ts              // CatmullRomCurve3 helpers
    domToWebGL.ts          // unproject helpers
  perf/
    detect.ts              // GPU/UA/connection
assets/
  models/                  // GLB/Draco/KTX2
  textures/
  fonts/
```

## Источники
- R3F Canvas options: <https://r3f.docs.pmnd.rs/api/canvas>
- Codrops: «How to build cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Builder.io: WebGL scroll animation — <https://www.builder.io/blog/webgl-scroll-animation>
- `r3f-scroll-rig` — <https://github.com/14islands/r3f-scroll-rig>
