import { Hero } from '@/components/scenes/Hero';

export default function Home() {
  return (
    <main>
      <Hero />
      <section className="scene" data-scene="services" id="services">
        <h2>Услуги</h2>
      </section>
      <section className="scene" data-scene="portfolio" id="portfolio">
        <h2>Портфолио</h2>
      </section>
      <section className="scene" data-scene="approach" id="approach">
        <h2>Подход</h2>
      </section>
      <section className="scene" data-scene="cta" id="cta">
        <h2>Свяжитесь</h2>
      </section>
    </main>
  );
}
