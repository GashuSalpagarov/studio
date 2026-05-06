# 04. 3D и анимационные техники

## TL;DR
Главный визуал — **чёрная линия (путь)**. На десктопе линия живёт в Three.js (`Line2` / `MeshLine` / SDF в шейдере); на мобильном — SVG `<path>` с `stroke-dashoffset`. Прогресс отрисовки — uniform `uDrawProgress` или `stroke-dashoffset`. Переход hero→точка — matched-canvas-position через `getBoundingClientRect` + `Vector3.unproject`. Бесконечный скролл — Lenis `infinite: true` с teleport-возвратом без визуального jump. Wipe-инверсия — clip-path circle expanding из CTA-зоны или mask gradient (не глобальный `filter: invert`). Кольцо прогресса — SVG circle с `stroke-dasharray` и `stroke-dashoffset`. Wormhole отозван как центральная метафора; туннельные эффекты допустимы только как локальный приём для wipe-перехода между сценами.

## Главная линия (путь)

Главный визуальный объект — **чёрная линия**, которая рисуется по мере скролла и проходит через все 5 сцен главной.

### Десктоп (WebGL)

Три варианта реализации, в порядке предпочтения:

1. **`Line2` (drei `<Line>`).** Толщина в screen-space, antialias, поддержка breakpoints. Хорошо работает для гладких CatmullRom-кривых. Прогресс отрисовки — через `dashOffset` материала или через subset вершин.

2. **MeshLine (`meshline` package или ручной shader).** Лучший контроль ширины и шейдинга, гибкие per-vertex эффекты (например, утолщение возле «продуктов»).

3. **SDF в шейдере.** Линия рисуется в фрагменте по signed-distance от кривой; даёт идеальный antialias и легко комбинируется с post-effects. Дороже по математике.

Для нашей задачи берём **Line2 / MeshLine**: достаточно гибко, дёшево, без сложных шейдеров.

```ts
// набросок: рисование прогрессом через uniform
material.uniforms.uDrawProgress.value = scrollProgress.current; // 0..1
// в фрагменте: discard, если относительная позиция вершины > uDrawProgress
```

Кривая линии — `CatmullRomCurve3` с centripetal параметризацией:

```ts
const points = [/* Vector3[] из спайн-узлов сценария */];
const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
const samples = curve.getPoints(800); // плотность под Line2
```

### Мобильный (SVG)

На мобильной версии та же кривая рисуется как SVG `<path>` с анимированным `stroke-dashoffset`:

```css
.line {
  stroke: var(--fg);
  stroke-width: 1.5;
  fill: none;
  stroke-dasharray: var(--length);
  stroke-dashoffset: calc(var(--length) * (1 - var(--progress)));
}
```

`--progress` обновляется из ScrollTrigger:

```js
ScrollTrigger.create({
  trigger: 'body',
  start: 0,
  end: 'max',
  scrub: true,
  onUpdate: (self) => document.documentElement.style.setProperty('--progress', String(self.progress)),
});
```

Та же `CatmullRomCurve3` сэмплируется в JS, выводится как `<path d="...">`. Это даёт визуальную и анимационную преемственность desktop↔mobile.

## Переход DOM → WebGL (compress to dot)

Цель: на конце сцены 1 DOM-точка hero и WebGL-точка занимают одинаковую позицию на экране, потом DOM-точка скрывается, WebGL-точка остаётся и стартует движение.

```ts
function syncDomToMesh(el: HTMLElement, mesh: Mesh, camera: PerspectiveCamera) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const ndcX =  cx / window.innerWidth  * 2 - 1;
  const ndcY = -cy / window.innerHeight * 2 + 1;
  const z = -2; // плоскость, на которой живёт WebGL-точка
  const v = new Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize();
  const dist = (z - camera.position.z) / dir.z;
  mesh.position.copy(camera.position).add(dir.multiplyScalar(dist));
}
```

Триггер swap'а — лейбл `compress-end` в master-таймлайне: GSAP анимирует `dom.opacity` 1→0 и `mesh.material.opacity` 0→1 на одном tween'е, а под капотом `useFrame` каждый кадр держит DOM↔WebGL координаты совпадающими.

Альтернатива — `r3f-scroll-rig` `<ScrollScene track={ref}>`: автоматически считает rect и подаёт `position` в children. Берём этот путь, если хватит контроля над scale/opacity; в противном случае — ручной режим выше.

## Камера

Преимущественно **ortho** или **плоская перспектива вдоль линии** — не fly-through. Камера может слегка следовать за активной точкой линии для ощущения присутствия, но без агрессивного движения через тубу.

```ts
useFrame(() => {
  const t = mapProgressToCameraT(scrollProgress.current);
  const pos = curve.getPointAt(t);
  // позиция камеры — лёгкий offset перпендикулярно линии, фиксированный z
  camera.position.set(pos.x, pos.y, fixedCameraZ);
  camera.lookAt(pos.x, pos.y, 0);
});
```

`OrthographicCamera` тоже валиден — особенно для строгого продуктового вида линии.

## Бесконечный скролл (loop)

Бесконечный скролл — обязательная часть сценария. Реализация:

### Lenis `infinite: true`

```ts
const lenis = new Lenis({ infinite: true, lerp: 0.1 });
```

`infinite: true` зацикливает скролл, telephone-режим: после конца возвращается к началу. Минусы: ScrollTrigger по-умолчанию рассчитывает `end: 'max'` один раз; листенер `lenis.on('scroll', ScrollTrigger.update)` (см. [02-architecture.md](./02-architecture.md)) корректирует.

### Clone-mounting и teleport без видимого jump

Чтобы переход «конец → начало» был визуально бесшовным:

1. В DOM-конце страницы дублируется блок Hero (clone-mount): первые ~50–100vh главной.
2. ScrollTrigger срабатывает на пороге ~95% страницы и стартует анимацию инверсии.
3. На пороге 100% (или ровно в момент завершения wipe-инверсии) Lenis телепортирует скролл в эквивалентную позицию в начале страницы. Поскольку финальный кадр CTA (после wipe) визуально совпадает с инвертированным первым кадром Hero — переход не виден.
4. После teleport инверсия продолжает работать как фон: палитра остаётся инвертированной до следующего захода в CTA.

Это **«infinite carousel-like loop»**, а не одноразовый возврат. Альтернатива — clone-based loop с ручным `scrollTo(0)`; используется как fallback, если Lenis `infinite` начнёт конфликтовать с ScrollTrigger.

## Wipe-инверсия на CTA

Wipe-инверсия живёт **только на CTA-зоне главной** (диапазон 0.92–1.00). Внутренние страницы — без инверсии.

### Не используем глобальный `filter: invert(1)`

Минусы глобального `filter: invert`: ломает GPU-композитинг, даёт «прыжки» цвета на subpixel-границах, не даёт контроля над зоной перехода.

### Вариант A — clip-path circle expanding (DOM)

```css
.invert-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-inverted);
  color: var(--fg-inverted);
  clip-path: circle(0% at var(--cta-x) var(--cta-y));
  pointer-events: none;
}
```

GSAP tween — `clip-path: circle(150% at ...)` от 0% до 150% на прогрессе 0.92→1.00. `--cta-x` и `--cta-y` берутся из `getBoundingClientRect` CTA-кнопки в момент мониторинга.

### Вариант B — mask gradient (canvas)

Финальный effect-проход в EffectComposer:

```glsl
uniform sampler2D tDiffuse;
uniform float uInvert;     // 0..1
uniform vec2 uOrigin;      // экранные координаты CTA
uniform float uRadius;     // 0..1, растёт по uInvert
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float d = distance(vUv, uOrigin);
  float k = smoothstep(uRadius - 0.02, uRadius, d); // 0 внутри, 1 снаружи
  vec3 inverted = 1.0 - c;
  gl_FragColor = vec4(mix(inverted, c, k), 1.0);
}
```

Внутри круга — инвертированные цвета, снаружи — исходные. Радиус растёт по `uInvert` 0→√2 (диагональ).

### DOM-палитра через CSS custom properties

Чтобы DOM плавно следовал инверсии (сохраняя antialiased текст), используем `@property`:

```css
@property --bg { syntax: '<color>'; inherits: true; initial-value: #ffffff; }
@property --fg { syntax: '<color>'; inherits: true; initial-value: #0a0a0a; }
```

GSAP меняет `--bg`, `--fg` на корне на той же scrubbed-полосе 0.92→1.00. Так DOM-цвета синхронны с canvas-инверсией без `filter`.

**Принимаемое решение:** Вариант A (clip-path) для DOM-overlay + `@property` для tokens; Вариант B (canvas mask) — только если нужно инвертировать сам canvas-контент. На главной чаще всего Вариант A достаточен.

## Кольцо прогресса

Простое SVG-кольцо в углу страницы. Без чисел, без сегментов.

```html
<svg viewBox="0 0 40 40" class="progress-ring">
  <circle cx="20" cy="20" r="18" fill="none"
          stroke="var(--fg)" stroke-width="1.5"
          stroke-dasharray="113.097"
          stroke-dashoffset="calc(113.097 * (1 - var(--progress)))"
          transform="rotate(-90 20 20)" />
</svg>
```

`113.097` ≈ `2 * π * 18` — длина окружности. `--progress` обновляется из ScrollTrigger (см. выше). Рендерится в `app/layout.tsx` как fixed-позиционированный элемент, переживает route changes.

На внутренних страницах кольцо может скрываться или показывать прогресс по странице (опционально, фиксируется на дизайн-этапе).

## Wormhole как опциональный приём

Wormhole **отозван как центральная метафора**. Остаётся в арсенале как **локальный wipe-эффект**: например, между двумя сценами линии или на route transition можно использовать короткий tube-fly-through (0.3–0.6 сек), как визуальный «прокол» между состояниями.

Базовая техника — `TubeGeometry` с UV-смещением + InstancedMesh particle streaks + Bloom/CA — остаётся документированной для возможного использования. Параметры: `tubularSegments=200..400`, `radialSegments=24..48`, `closed=false`. UV-смещение в фрагменте: `vec2 uv = vec2(vUv.x, vUv.y - uTime * 0.4 - uSegmentT * 2.0);`.

Реф: «Infinite Tubes with Three.js» (Codrops 2017) и «Tunnel Animation» Mamboleoo.

## Текст в сцене

`drei` `<Text>` (троика под капотом) — SDF, читается на любой глубине. Используем редко — основная типографика живёт в DOM (для SEO, селекта, доступности). WebGL-текст — только если нужен perspective-эффект, который не воспроизвести в DOM.

## Источники
- Codrops: «How to build cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Codrops: «Infinite Tubes with Three.js» — <https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/>
- Mamboleoo: tunnel animation — <https://www.mamboleoo.be/articles/tunnel-animation-1>
- Maxime Heckel: post-processing as creative medium — <https://blog.maximeheckel.com/posts/post-processing-as-a-creative-medium/>
- Jon Shamir: Color Mode — <https://jonshamir.com/writing/color-mode>
- Codrops: infinite loop scrolling — <https://tympanus.net/codrops/2023/01/11/getting-creative-with-infinite-loop-scrolling/>
- Inverse Color Cursor — <https://www.awwwards.com/inspiration/inverse-color-cursor-in-scroll-project-page>
- Doel Festival inverted scroll — <https://www.awwwards.com/inspiration/inverted-section-scroll-interaction-doel-festival>
