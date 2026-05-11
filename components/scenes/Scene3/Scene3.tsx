"use client";

import { useEffect, useRef } from "react";
import { r3fTunnel } from "@/r3f/tunnel";
import styles from "./Scene3.module.css";
import { Scene3R3F } from "./Scene3R3F";

export function Scene3() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    const update = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const h = window.innerHeight;
      // Прогресс мапится на нарратив сцены: 0 — секция только вошла снизу viewport,
      // 1 — sticky отпустила (конец сцены, дальше пойдёт Scene 4).
      const total = rect.height;
      const scrolled = h - rect.top;
      const p = total > 0 ? Math.max(0, Math.min(1, scrolled / total)) : 0;
      progressRef.current = p;

      // CSS-точка: фейд-аут к p=0.5 (когда поток частиц берёт верх) и обратный фейд-ин
      // в M9 (0.95..1.0), когда формируется новое ядро.
      const dropFadeOut = Math.max(0, Math.min(1, (0.5 - p) / 0.1));
      const dropFadeIn = Math.max(0, Math.min(1, (p - 0.95) / 0.05));
      const dropOpacity = Math.max(dropFadeOut, dropFadeIn);
      document.documentElement.style.setProperty("--drop-opacity", `${dropOpacity}`);
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <section ref={sectionRef} className={styles.scene3} data-scene="scene3">
      <div className={styles.sticky} />
      <r3fTunnel.In>
        <Scene3R3F progressRef={progressRef} />
      </r3fTunnel.In>
    </section>
  );
}
