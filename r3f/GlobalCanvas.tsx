"use client";

import { Canvas } from "@react-three/fiber";
import { r3fTunnel } from "./tunnel";

// TODO: переключение mobile/desktop, GPU detect — см. docs/02-architecture.md и docs/05-performance.md.
// Содержимое сцен подаётся через r3fTunnel из соответствующих DOM-компонентов.
export function GlobalCanvas() {
  return (
    <Canvas
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <r3fTunnel.Out />
    </Canvas>
  );
}
