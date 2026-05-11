import tunnel from "tunnel-rat";

// Общий R3F-тоннель: компоненты сцен оборачивают свой 3D-контент в <r3fTunnel.In>...</r3fTunnel.In>,
// а GlobalCanvas рендерит <r3fTunnel.Out /> у себя внутри. Так все сцены делят один WebGL-контекст.
export const r3fTunnel = tunnel();
