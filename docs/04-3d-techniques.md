# 04. 3D-техники

## TL;DR
Wormhole — гибрид `TubeGeometry` + `InstancedMesh` particle streaks + post-FX (Bloom + ChromaticAberration + radial blur). Переход hero→точка — matched-canvas-position через `getBoundingClientRect` + `Vector3.unproject`. Камера летит по `CatmullRomCurve3.getPointAt/getTangentAt`. Инверсия цвета — uniform `uInvert` в финальном эффекте плюс CSS `@property` для DOM. Текст в WebGL — Troika через `<Text>` из drei. Loop — Lenis `infinite: true`.

## Wormhole

Гибридная конструкция из трёх слоёв в одном `<group>`:

1. **TubeGeometry** на основе `CatmullRomCurve3`. Параметры: `tubularSegments=200..400`, `radialSegments=24..48`, `closed=false`. Материал — `ShaderMaterial` с двумя картами (base + glow), UV смещаются по `uTime + uProgress`.

2. **InstancedMesh particle streaks.** Тонкие boxы или quad'ы (либо `Points` с anisotropic stretch в vertex shader). Сотни инстансов размещаются вдоль кривой; в vertex shader каждый инстанс растягивается по тангенсу пропорционально `uSpeed`. На выходе — длинные световые штрихи, а не отдельные шарики.

3. **Post-FX.** EffectComposer:
   - `Bloom` (intensity 0.6–1.2, threshold 0.8, smoothing 0.4).
   - `ChromaticAberration` (offset 0.0008–0.002, по `uProgress` в туннеле растёт).
   - Кастомный radial blur (UV→полярные координаты, blur по радиусу) для ощущения скорости.

Скетч uniform'ов туннельного материала:

```
uTime         // RAF time
uProgress     // 0..1 глобально
uSegmentT     // 0..1 внутри сегмента
uSpeed        // производная от Lenis velocity
uInvert       // 0..1, финальный эффект
```

UV-смещение в фрагменте: `vec2 uv = vec2(vUv.x, vUv.y - uTime * 0.4 - uSegmentT * 2.0);`.

Реф: «Infinite Tubes with Three.js» (Codrops 2017) и «Tunnel Animation» Mamboleoo — алгоритмически базовые рецепты, мы добавляем ScrollTrigger-driven `uSegmentT` вместо автономного времени.

## Переход DOM → WebGL (compress to dot)

Цель: на конце сжатия hero DOM-точка и WebGL-точка занимают одинаковую позицию на экране, потом DOM-точка скрывается, WebGL-точка остаётся.

```ts
function syncDomToMesh(el: HTMLElement, mesh: Mesh, camera: PerspectiveCamera) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const ndcX =  cx / window.innerWidth  * 2 - 1;
  const ndcY = -cy / window.innerHeight * 2 + 1;
  // выбираем плоскость по фиксированному z в мировых координатах
  const z = -2; // плоскость, на которой живёт WebGL-точка
  const v = new Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize();
  const dist = (z - camera.position.z) / dir.z;
  mesh.position.copy(camera.position).add(dir.multiplyScalar(dist));
}
```

Триггер swap'а — лейбл `compress-end` в master-таймлайне: GSAP анимирует `dom.opacity` 1→0 и `mesh.material.opacity` 0→1 на одном tween'е, а под капотом `useFrame` каждый кадр держит DOM↔WebGL координаты совпадающими.

Альтернатива — `r3f-scroll-rig` `<ScrollScene track={ref}>`: автоматически считает rect и подаёт `position` в children. Берём этот путь, если хватит контроля над scale/opacity; в противном случае — ручной режим выше.

## Camera path

```ts
const points = [/* Vector3[] из спайн-узлов */];
const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);

useFrame(() => {
  const t = mapProgressToCameraT(scrollProgress.current);
  const pos = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  camera.position.copy(pos);
  camera.lookAt(pos.clone().add(tan));
});
```

`centripetal` обязательно — иначе на резких поворотах появляются петли. `getPointAt`, а не `getPoint` — потому что нужно постоянное «расстояние = время», а не равномерное по контрольным точкам.

Для отладки добавить `<DebugCurve />` (drei `<Line>` по `curve.getPoints(200)`) и переключатель в dev-окружении.

## Color inversion на петле

**Вариант A — uniform в финальном Effect (рекомендуется для WebGL).**

```glsl
// inversion.frag
uniform sampler2D tDiffuse;
uniform float uInvert;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(mix(c, 1.0 - c, uInvert), 1.0);
}
```

Подключается как последний эффект в `EffectComposer`, после Bloom/CA. `uInvert` — gsap tween 0.92→1.00.

**Вариант B — CSS `filter: invert(1)` + `mix-blend-mode: difference`.**

Дёшево, но `filter: invert` не идеально дружит с GPU-композитингом и иногда даёт «прыжки» цвета на subpixel-границах. Подходит для быстрого прототипа.

**Рекомендация.** A для WebGL-слоя; для DOM — `@property --bg, --fg` с keyframes:

```css
@property --bg { syntax: '<color>'; inherits: true; initial-value: #0a0a0a; }
@property --fg { syntax: '<color>'; inherits: true; initial-value: #f5f5f5; }
```

GSAP меняет custom-properties на корне, DOM плавно переходит синхронно с `uInvert`.

## Текст в WebGL

`drei` `<Text>` (троика под капотом) — SDF, читается на любой глубине. Используем для overlay-надписей этапов («Discover», «Design», «Build»), если нужно, чтобы текст «жил» в перспективе.

Если нужно DOM-acceptable selection / SEO — оставляем текст в DOM, а WebGL-сцена просто синхронизируется по позиции через `r3f-scroll-rig`.

## Particle streaks

Два варианта:

| Вариант | Плюсы | Минусы |
|---|---|---|
| `InstancedMesh` thin box geometry | Полный контроль над масштабом по тангенсу, нормали есть | Чуть тяжелее по vertex'ам |
| `Points` + custom shader (anisotropic stretch) | Дешёво по геометрии | Нужен кастомный vertex для растяжения |

Берём `InstancedMesh`: он лучше дружит с post-FX (нормально проявляется в Bloom без артефактов).

## Loop scroll

```ts
const lenis = new Lenis({ infinite: true, lerp: 0.1 });
```

`infinite: true` зацикливает скролл. Минусы: ScrollTrigger по-умолчанию рассчитывает `end: 'max'` один раз, поэтому добавляем listener `lenis.on('scroll', ScrollTrigger.update)` (уже есть в [02-architecture.md](./02-architecture.md)).

Альтернатива — clone-based loop: дублирование DOM в конце страницы и ручной seek через `scrollTo(0)` при достижении 1.0. Используем как fallback.

На петле `uInvert` остаётся 1; повторно петля → инверсия второй раз даёт оригинальную палитру; на каждой чётной петле палитра одна, на нечётной — другая. Можно либо удерживать `uInvert = 1` навсегда, либо тогглить — концепт-решение фиксируется на этапе визуального дизайна.

## Источники
- Codrops: «How to build cinematic 3D scroll experiences with GSAP» — <https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/>
- Codrops: «Infinite Tubes with Three.js» — <https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/>
- Mamboleoo: tunnel animation — <https://www.mamboleoo.be/articles/tunnel-animation-1>
- Maxime Heckel: post-processing as creative medium — <https://blog.maximeheckel.com/posts/post-processing-as-a-creative-medium/>
- Jon Shamir: Color Mode — <https://jonshamir.com/writing/color-mode>
- Codrops: infinite loop scrolling — <https://tympanus.net/codrops/2023/01/11/getting-creative-with-infinite-loop-scrolling/>
- Inverse Color Cursor — <https://www.awwwards.com/inspiration/inverse-color-cursor-in-scroll-project-page>
- Doel Festival inverted scroll — <https://www.awwwards.com/inspiration/inverted-section-scroll-interaction-doel-festival>
