"use client";

import Link from "next/link";
import { type RefObject, useEffect, useRef } from "react";
import { CARDS_CONTENT } from "./cardsData";
import styles from "./Scene3Finale.module.css";

type Props = {
  progressRef: RefObject<number>;
};

// Финальная сетка Сцены 3: 4 кейса (3 сверху + 1 широкий снизу) + блок-приглашение.
// Видимость привязана к прогрессу сцены: карточки прилетают на 0.93..0.99, когда
// частицы уже почти собрались. До этого момента — за пределами экрана, без кликов.
export function Scene3Finale({ progressRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = progressRef.current ?? 0;
      const t = Math.max(0, Math.min(1, (p - 0.93) / 0.06));
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const node = containerRef.current;
      if (node) {
        node.style.setProperty("--finale-opacity", `${eased}`);
        node.style.setProperty("--finale-pointer-events", eased > 0.5 ? "auto" : "none");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  const cards = CARDS_CONTENT;
  const positions = [styles.card1, styles.card2, styles.card3, styles.card4];
  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.grid}>
        {cards.map((card, i) => (
          <article key={card.title} className={`${styles.card} ${positions[i]}`}>
            <div className={styles.cardImage} />
            <div className={styles.cardContent}>
              <span className={styles.cardTag}>{card.tag}</span>
              <h3 className={styles.cardTitle}>{card.title}</h3>
              <p className={styles.cardDescription}>{card.description}</p>
              <Link href="/cases" className={styles.cardLink}>
                Посмотреть кейс →
              </Link>
            </div>
          </article>
        ))}
        <Link href="/cases" className={styles.invitation} aria-label="Смотреть все работы">
          <div className={styles.invitationCta}>
            <h3 className={styles.invitationTitle}>Все работы</h3>
            <span className={styles.invitationArrow} aria-hidden="true">
              →
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
