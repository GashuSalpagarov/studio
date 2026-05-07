'use client';

import { useEffect, useRef } from 'react';
import styles from './Scene2.module.css';

// Колена траектории. Phase отсчитывается от scroll = 43vh (момент фиксации точки в центре).
// 7vh «прелюдии» — ничтожная вертикальная прямая прежде чем начнётся первое колено.
const KNEES = [
  { start: 7, end: 107, amplitude: -32 },
  { start: 107, end: 207, amplitude: 18 },
  { start: 207, end: 307, amplitude: -26 },
  { start: 307, end: 407, amplitude: 14 },
];

// Каждый блок имеет triggerVh — scroll-позицию, на которой точка проходит «мимо» него.
// Раньше triggerVh-25 блок невидим, после triggerVh — полностью виден и остаётся
// видимым пока скроллим вниз. При обратной прокрутке выше triggerVh-25 блок исчезает.
type Block = {
  title: string;
  body: string;
  side: 'left' | 'right';
  trigger: number; // scrollVh, на котором блок становится полностью видимым
  parallaxY: number; // индивидуальный коэффициент Y-параллакса (глубина блока)
};

const BLOCKS: Block[] = [
  // Колено 0 — точка идёт влево, блоки справа
  {
    title: 'Кто мы',
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    side: 'right',
    trigger: 75,
    parallaxY: 0.22,
  },
  {
    title: 'Манифест',
    body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor.',
    side: 'right',
    trigger: 120,
    parallaxY: 0.32,
  },
  // Колено 1 — точка идёт вправо, блоки слева
  {
    title: 'Что делаем',
    body: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    side: 'left',
    trigger: 175,
    parallaxY: 0.18,
  },
  {
    title: 'Подходы',
    body: 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.',
    side: 'left',
    trigger: 220,
    parallaxY: 0.28,
  },
  // Колено 2 — точка идёт влево, блоки справа
  {
    title: 'Этапы',
    body: 'Eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem.',
    side: 'right',
    trigger: 275,
    parallaxY: 0.26,
  },
  {
    title: 'Принципы',
    body: 'Quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
    side: 'right',
    trigger: 320,
    parallaxY: 0.20,
  },
  // Колено 3 — точка идёт вправо, блоки слева
  {
    title: 'Проекты',
    body: 'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur adipisci velit, sed quia non numquam.',
    side: 'left',
    trigger: 375,
    parallaxY: 0.30,
  },
  {
    title: 'Результаты',
    body: 'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti.',
    side: 'left',
    trigger: 420,
    parallaxY: 0.24,
  },
];

function getDropX(scrollVh: number): number {
  if (scrollVh < 43) return 0;
  const phase = scrollVh - 43;
  for (const knee of KNEES) {
    if (phase >= knee.start && phase < knee.end) {
      const local = (phase - knee.start) / (knee.end - knee.start);
      // Косинусная колоколообразная: производная = 0 на границах колена,
      // что даёт плавный переход между коленами без излома.
      return knee.amplitude * 0.5 * (1 - Math.cos(2 * Math.PI * local));
    }
  }
  return 0;
}

// Opacity монотонно по scroll: до triggerVh-fadeRange — 0, после triggerVh — 1,
// между ними — линейно. При обратной прокрутке возвращается в 0.
function getBlockOpacity(scrollVh: number, triggerVh: number): number {
  const fadeRange = 25;
  if (scrollVh >= triggerVh) return 1;
  if (scrollVh < triggerVh - fadeRange) return 0;
  return (scrollVh - (triggerVh - fadeRange)) / fadeRange;
}

// Y-параллакс: блок отстаёт от скролла на индивидуальный фактор — разная «глубина» для разных блоков.
function getBlockParallaxY(scrollVh: number, triggerVh: number, factor: number): number {
  return (scrollVh - triggerVh) * factor;
}

// X-параллакс монотонный: блок дрейфует только в сторону линии (к центру viewport)
// при увеличении скролла. Ограничен по максимальному смещению, чтобы не наезжать на линию.
function getBlockParallaxX(scrollVh: number, triggerVh: number, side: 'left' | 'right'): number {
  const factor = 0.06;
  const maxOffset = 3; // vw — максимальный сдвиг к линии
  const towardCenterSign = side === 'right' ? -1 : 1;
  const raw = towardCenterSign * (scrollVh - triggerVh) * factor;
  // Clamp в обе стороны
  return Math.max(-maxOffset, Math.min(maxOffset, raw));
}

function buildPathD(scrollVh: number, w: number, h: number): string {
  if (scrollVh <= 41) return '';

  const points: [number, number][] = [];

  // Начало пути — там, где была подпись «начало пути».
  const labelX = w * 0.5;
  const labelY = ((91 - scrollVh) * h) / 100;
  points.push([labelX, labelY]);

  const startS = 43;
  const step = 0.6;
  let lastS = startS;
  for (let s = startS; s <= scrollVh; s += step) {
    const dropX = getDropX(s);
    const x = ((50 + dropX) * w) / 100;
    const y = ((50 + s - scrollVh) * h) / 100;
    points.push([x, y]);
    lastS = s;
  }

  // Если шаг не попал точно в текущий scroll — добавим финальную точку,
  // чтобы трасса заканчивалась ровно у точки.
  if (scrollVh - lastS > 0.01) {
    const finalDropX = getDropX(scrollVh);
    points.push([((50 + finalDropX) * w) / 100, h * 0.5]);
  }

  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]}`;
  }

  // Catmull-Rom через cubic Bezier — кривая проходит через все sample points
  // с C1-гладкостью.
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : points[i + 1];

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function Scene2() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scrollVh = (window.scrollY / h) * 100;
      const dropX = getDropX(scrollVh);

      // X-смещение точки — отсюда. Y-смещение и фиксация — Hero.
      root.style.setProperty('--drop-x', `${dropX}vw`);

      for (let i = 0; i < BLOCKS.length; i++) {
        const block = BLOCKS[i];
        root.style.setProperty(
          `--block-${i + 1}-opacity`,
          `${getBlockOpacity(scrollVh, block.trigger)}`,
        );
        root.style.setProperty(
          `--block-${i + 1}-y`,
          `${getBlockParallaxY(scrollVh, block.trigger, block.parallaxY)}vh`,
        );
        root.style.setProperty(
          `--block-${i + 1}-x`,
          `${getBlockParallaxX(scrollVh, block.trigger, block.side)}vw`,
        );
      }

      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPathD(scrollVh, w, h));
      }
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <section className={styles.scene2} data-scene="scene2">
      <svg className={styles.trail} aria-hidden="true">
        <path
          ref={pathRef}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {BLOCKS.map((block, i) => (
        <aside
          key={block.title}
          className={`${styles.block} ${block.side === 'right' ? styles.right : styles.left} ${styles[`block${i + 1}`]}`}
        >
          <h2>{block.title}</h2>
          <p>{block.body}</p>
        </aside>
      ))}
    </section>
  );
}
