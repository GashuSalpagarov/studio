'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Hero.module.css';
import { HeroLiquidIntro } from './HeroLiquidIntro';
import { HeroScrollLock } from './HeroScrollLock';

export function Hero() {
  const startMsRef = useRef<number | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      startMsRef.current = performance.now();
      setReady(true);
    });
  }, []);

  // Hero отвечает только за вертикальное движение точки к центру и её фиксацию.
  // Горизонтальная траектория и контент сцены 2 — в Scene2.
  useEffect(() => {
    const root = document.documentElement;
    const updateOffset = () => {
      if (!dropRef.current) return;
      const h = window.innerHeight;
      const scrollVh = (window.scrollY / h) * 100;
      const offsetVh = Math.max(43 - scrollVh, 0);

      root.style.setProperty('--drop-offset', `${offsetVh}vh`);

      if (offsetVh <= 0) {
        dropRef.current.classList.add(styles.dropPinned);
      } else {
        dropRef.current.classList.remove(styles.dropPinned);
      }
    };

    window.addEventListener('scroll', updateOffset, { passive: true });
    window.addEventListener('resize', updateOffset);
    updateOffset();

    return () => {
      window.removeEventListener('scroll', updateOffset);
      window.removeEventListener('resize', updateOffset);
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className={`scene ${styles.hero} ${ready ? styles.ready : ''}`}
      data-scene="hero"
      id="hero"
    >
      <HeroScrollLock />

      <div className={styles.pill} aria-hidden="true" />
      <span className={styles.studioLabel}>studio</span>
      <span className={styles.ctaLabel}>Связаться</span>

      <h1 className={styles.title}>{'Создаём цифровые\nпродукты'}</h1>

      <div ref={dropRef} className={styles.drop} aria-hidden="true" />
      <span className={styles.dropLabel}>начало пути</span>

      <HeroLiquidIntro startMs={ready ? startMsRef.current : null} />

      <span className={styles.logo}>studio</span>
      <a className={styles.phone} href="tel:+79990000000">
        +7 (999) 000-00-00
      </a>
    </section>
  );
}
