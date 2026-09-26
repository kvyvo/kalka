import { outline } from './outline.js';

self.onmessage = ({ data: { id, img, strength, bw } }) => {
  const out = bw ? threshold(img, strength) : outline(img, strength);
  self.postMessage({ id, data: out, width: img.width, height: img.height }, [out.buffer]);
};

function threshold({ data }, strength) {
  const t = 40 + strength * 1.8;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const g = 255 - a * (255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]));
    out[i] = out[i + 1] = out[i + 2] = g < t ? 0 : 255;
    out[i + 3] = 255;
  }
  return out;
}
