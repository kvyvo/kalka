const MAX_PX = 4096 * 4096;
const MAX_WORK_PX = 8e6;
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';

function decode(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = url;
  });
}

function svgSize(text) {
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const unit = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
  const parse = (v) => {
    const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc)\s*$/.exec(v || '');
    return m ? parseFloat(m[1]) * unit[m[2]] : null;
  };
  const w = parse(root.getAttribute('width')), h = parse(root.getAttribute('height'));
  return w && h ? { w, h } : null;
}

async function renderPdf(blob) {
  const pdfjs = await import(PDFJS + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const physical = { w: (base.width / 72) * 25.4, h: (base.height / 72) * 25.4 };
  const scale = Math.min(8, Math.sqrt(MAX_PX / (base.width * base.height)));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const png = await new Promise((r) => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  return { blob: png, physical, pages: doc.numPages };
}

export async function openFile(file) {
  let blob = file, physical = null, pages = 1;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
  if (isPdf) ({ blob, physical, pages } = await renderPdf(file));
  else if (isSvg) physical = svgSize(await file.text());
  const url = URL.createObjectURL(blob);
  try {
    const img = await decode(url);
    await img.decode?.().catch(() => {});
    let w = img.naturalWidth, h = img.naturalHeight;
    if (isSvg) {
      const aspect = physical ? physical.w / physical.h : (w && h ? w / h : 1);
      h = Math.round(Math.sqrt(MAX_WORK_PX / aspect)); w = Math.round(h * aspect);
    }
    return { blob, url, img, w, h, physical, pages, svg: isSvg };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

let worker = null, seq = 0;
function runWorker(img, strength, bw) {
  worker ||= new Worker(new URL('./outline.worker.js', import.meta.url), { type: 'module' });
  const id = ++seq;
  return new Promise((resolve) => {
    const on = ({ data }) => { if (data.id === id) { worker.removeEventListener('message', on); resolve(data); } };
    worker.addEventListener('message', on);
    worker.postMessage({ id, img, strength, bw }, [img.data.buffer]);
  });
}

function transformed(src, rot, mirror, maxPx) {
  const k = Math.min(1, Math.sqrt(maxPx / (src.w * src.h)));
  const sw = Math.round(src.w * k), sh = Math.round(src.h * k);
  const odd = rot % 2 === 1;
  const c = document.createElement('canvas');
  c.width = odd ? sh : sw; c.height = odd ? sw : sh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 2);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(src.img, -sw / 2, -sh / 2, sw, sh);
  return c;
}

const toUrl = (c) => new Promise((r) => c.toBlob((b) => { c.width = c.height = 0; r(URL.createObjectURL(b)); }, 'image/png'));

export async function prepare(src, { view, strength, rot, mirror }) {
  const owned = [];
  let color = src.url, w = src.w, h = src.h;
  if (rot || mirror) {
    const c = transformed(src, rot, mirror, MAX_PX);
    w = c.width; h = c.height;
    color = await toUrl(c); owned.push(color);
  }
  if (view === 'original') return { color, view: color, w, h, owned };
  const c = transformed(src, rot, mirror, MAX_WORK_PX);
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const out = await runWorker(img, strength, view === 'bw');
  ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  const v = await toUrl(c); owned.push(v);
  return { color, view: v, w, h, owned };
}
