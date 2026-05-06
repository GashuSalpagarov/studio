import styles from './Hero.module.css';

export function Hero() {
  return (
    <section className={`scene ${styles.hero}`} data-scene="hero" id="hero">
      <div className={styles.pill} aria-hidden="true" />
      <span className={styles.studioLabel}>studio</span>
      <span className={styles.ctaLabel}>Связаться</span>
      <h1 className={styles.titleObject}>
        Создаём цифровые
        <br />
        продукты
      </h1>
      <div className={styles.drop} aria-hidden="true" />
    </section>
  );
}
