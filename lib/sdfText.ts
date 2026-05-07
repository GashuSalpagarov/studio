const INF = 1e20;

function dt1d(f: Float32Array): Float32Array {
  const n = f.length;
  const d = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    while (true) {
      const num = f[q] + q * q - (f[v[k]] + v[k] * v[k]);
      const den = 2 * q - 2 * v[k];
      s = num / den;
      if (s > z[k] || k === 0) break;
      k--;
    }
    if (s <= z[k]) {
      v[k] = q;
    } else {
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
  return d;
}

function dt2d(grid: Uint8Array, w: number, h: number, invert: boolean): Float32Array {
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const set = grid[i] === 1;
    f[i] = invert ? (set ? INF : 0) : set ? 0 : INF;
  }

  const colBuf = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) colBuf[y] = f[y * w + x];
    const d = dt1d(colBuf);
    for (let y = 0; y < h; y++) f[y * w + x] = d[y];
  }

  const rowBuf = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) rowBuf[x] = f[y * w + x];
    const d = dt1d(rowBuf);
    for (let x = 0; x < w; x++) f[y * w + x] = d[x];
  }

  return f;
}

export type TextSDFResult = {
  sdf: Float32Array;
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  fontSize: number;
};

export function generateTextSDF(
  text: string,
  fontSize = 80,
  fontFamily = 'system-ui, sans-serif',
  fontWeight = 500,
  letterSpacing = -0.02,
  lineHeight = 1.25,
  padding = 60,
  supersample = 2,
): TextSDFResult {
  const lines = text.split('\n');
  const ssFontSize = fontSize * supersample;
  const ssPadding = padding * supersample;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas 2D not available');
  measure.font = `${fontWeight} ${ssFontSize}px ${fontFamily}`;
  measure.textBaseline = 'middle';

  let maxLineWidth = 0;
  for (const line of lines) {
    const baseWidth = measure.measureText(line).width;
    const trackingWidth = letterSpacing * ssFontSize * (line.length - 1);
    maxLineWidth = Math.max(maxLineWidth, baseWidth + trackingWidth);
  }
  const lh = ssFontSize * lineHeight;
  const totalH = lines.length * lh;

  const w = Math.ceil(maxLineWidth) + ssPadding * 2;
  const h = Math.ceil(totalH) + ssPadding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'white';
  ctx.font = `${fontWeight} ${ssFontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < lines.length; i++) {
    const y = ssPadding + lh * (i + 0.5);
    if (letterSpacing === 0) {
      ctx.fillText(lines[i], w / 2, y);
    } else {
      const line = lines[i];
      const trackPx = letterSpacing * ssFontSize;
      const baseW = ctx.measureText(line).width;
      const totalW = baseW + trackPx * (line.length - 1);
      let x = w / 2 - totalW / 2;
      ctx.textAlign = 'left';
      for (const ch of line) {
        ctx.fillText(ch, x, y);
        const chW = ctx.measureText(ch).width;
        x += chW + trackPx;
      }
      ctx.textAlign = 'center';
    }
  }

  const img = ctx.getImageData(0, 0, w, h);
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grid[i] = img.data[i * 4] > 128 ? 1 : 0;
  }

  const dtToInside = dt2d(grid, w, h, false);
  const dtToOutside = dt2d(grid, w, h, true);

  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    sdf[i] = (Math.sqrt(dtToInside[i]) - Math.sqrt(dtToOutside[i])) / supersample;
  }

  return {
    sdf,
    width: w,
    height: h,
    worldWidth: w / supersample,
    worldHeight: h / supersample,
    fontSize,
  };
}
