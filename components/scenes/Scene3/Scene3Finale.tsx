"use client";

import Link from "next/link";
import { CARDS_CONTENT } from "./cardsData";
import styles from "./Scene3Finale.module.css";

// Финальная сетка Сцены 3: 4 кейса (3 сверху + 1 широкий снизу) + блок-приглашение.
// На этом шаге — статичный layout с opacity 1 для проверки раскладки.
// Привязку к скроллу и slide-in анимацию добавим следующими шагами.
export function Scene3Finale() {
  const cards = CARDS_CONTENT;
  const positions = [styles.card1, styles.card2, styles.card3, styles.card4];
  return (
    <div className={styles.container}>
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
        <aside className={styles.invitation}>
          <h3 className={styles.invitationTitle}>Все работы</h3>
          <p className={styles.invitationDescription}>
            Полный каталог — больше кейсов, форматов и задач.
          </p>
          <Link href="/cases" className={styles.invitationButton}>
            Смотреть все →
          </Link>
        </aside>
      </div>
    </div>
  );
}
