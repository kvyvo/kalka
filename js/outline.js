// Turns a photo or a coloured picture into dark lines on white, for tracing.
// Works on plain {data, width, height} RGBA so it runs in a worker and in node tests.

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img RGBA
 * @param {number} strength 0..100, higher = more lines
 * @returns {Uint8ClampedArray} RGBA, black lines on white, same size
 */
export function outline({ data, width: w, height: h }, strength = 50) {
  const n = w * h;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255; // transparent = white paper
    g[i] = 255 - a * (255 - (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]));
  }
  const b = blur3(g, w, h);
  const mag = new Float32Array(n);
  let max = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - 1] - b[i + w - 1];
      const gy = b[i + w - 1] + 2 * b[i + w] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - w] - b[i - w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  // threshold relative to the strongest edge: strength 0 → 60 %, 100 → 3 %
  const t = max * (0.6 - 0.57 * Math.min(100, Math.max(0, strength)) / 100);
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    // soft edge around the threshold keeps lines smooth instead of jagged
    const v = mag[i] <= t * 0.7 ? 255 : mag[i] >= t ? 0 : 255 * (t - mag[i]) / (t * 0.3);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function blur3(src, w, h) {
  const tmp = new Float32Array(src.length), dst = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, l = x ? i - 1 : i, r = x < w - 1 ? i + 1 : i;
    tmp[i] = (src[l] + 2 * src[i] + src[r]) / 4;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = y ? i - w : i, d = y < h - 1 ? i + w : i;
    dst[i] = (tmp[u] + 2 * tmp[i] + tmp[d]) / 4;
  }
  return dst;
}
