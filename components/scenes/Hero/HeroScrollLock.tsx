'use client';

import { useEffect } from 'react';
import { useLenis } from '@/app/providers';

const INTRO_DURATION_MS = 9450;

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

export function HeroScrollLock() {
  const lenis = useLenis();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // На случай если Lenis ещё не успел скроллить страницу к верху
    window.scrollTo(0, 0);

    // Lenis перехватывает wheel/touch — стопаем его на время интро
    if (lenis) {
      lenis.stop();
    }

    // Дополнительная блокировка нативных событий — клавиатура, плюс fallback если Lenis не подключился (reduced-motion и т.п.)
    const preventScroll = (e: Event) => e.preventDefault();
    const preventScrollKeys = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };

    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventScrollKeys);

    const release = () => {
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('keydown', preventScrollKeys);
      if (lenis) {
        lenis.start();
      }
    };

    const timer = window.setTimeout(release, INTRO_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [lenis]);

  return null;
}
