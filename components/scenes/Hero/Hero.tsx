'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Hero.module.css';
import { HeroLiquidIntro } from './HeroLiquidIntro';
import { HeroScrollLock } from './HeroScrollLock';

export function Hero() {
  const startMsRef = useRef<number | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      startMsRef.current = performance.now();
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const updateOffset = () => {
      if (!dropRef.current) return;
      const vh = window.innerHeight;
      const scrollVh = (window.scrollY / vh) * 100;
      const offsetVh = Math.max(43 - scrollVh, 0);
      dropRef.current.style.setProperty('--drop-offset', `${offsetVh}vh`);

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
      className={`scene ${styles.hero} ${ready ? styles.ready : ''}`}
      data-scene="hero"
      id="hero"
    >
      <HeroScrollLock />

      <div className={styles.pill} aria-hidden="true" />
      <span className={styles.studioLabel}>studio</span>
      <span className={styles.ctaLabel}>Связаться</span>

      <h1 className={styles.title}>
        {'Создаём цифровые\nпродукты'}
      </h1>

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
