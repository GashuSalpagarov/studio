"use client";

import { useEffect, useRef } from "react";
import { r3fTunnel } from "@/r3f/tunnel";
import styles from "./Scene3.module.css";
import { Scene3R3F } from "./Scene3R3F";

export function Scene3() {
  const sectionRef = useRef<HTMLElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
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
      if (debugRef.current) {
        debugRef.current.textContent = `scene3 progress: ${p.toFixed(3)}`;
      }

      // CSS-точка из Hero фейдится к p=0.5 синхронно с R3F-ядром.
      const dropOpacity = Math.max(0, Math.min(1, (0.5 - p) / 0.1));
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
      <div className={styles.sticky}>
        <div ref={debugRef} className={styles.debug}>
          scene3 progress: 0.000
        </div>
      </div>
      <r3fTunnel.In>
        <Scene3R3F progressRef={progressRef} />
      </r3fTunnel.In>
    </section>
  );
}
