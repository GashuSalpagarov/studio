import Lenis from "lenis";

// TODO: интеграция с GSAP ticker и ScrollTrigger.update — см. docs/02-architecture.md
export function createLenis(): Lenis {
  return new Lenis({
    lerp: 0.1,
    smoothWheel: true,
  });
}
