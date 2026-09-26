export const SHEETS = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
};

export const CARD = { w: 85.6, h: 53.98, r: 3.18 };

export function sheetSize(name, landscape, custom) {
  if (name === 'custom') return { w: custom.w, h: custom.h };
  const [a, b] = SHEETS[name];
  return landscape ? { w: b, h: a } : { w: a, h: b };
}

export function fitDrawing(sheet, aspect, margin) {
  const aw = Math.max(1, sheet.w - 2 * margin), ah = Math.max(1, sheet.h - 2 * margin);
  let w = aw, h = aw / aspect;
  if (h > ah) { h = ah; w = ah * aspect; }
  w = Math.floor(w); h = Math.floor(h);
  return { w, h, x: (sheet.w - w) / 2, y: (sheet.h - h) / 2 };
}

export function cellSize(drawing, cols, rows) {
  return { w: drawing.w / cols, h: drawing.h / rows };
}

export function suggestGrid(drawing, view, pad = 10, max = 12) {
  let best = null;
  for (let cols = 1; cols <= max; cols++) {
    for (let rows = 1; rows <= max; rows++) {
      const c = cellSize(drawing, cols, rows);
      if (c.w + 2 * pad > view.w || c.h + 2 * pad > view.h) continue;
      const n = cols * rows;
      const skew = Math.abs(Math.log((c.w / c.h) / (view.w / view.h)));
      if (!best || n < best.n || (n === best.n && skew < best.skew)) best = { cols, rows, n, skew };
    }
  }
  return best ? { cols: best.cols, rows: best.rows } : { cols: max, rows: max };
}

export function gridLines(sheet, drawing, cols, rows) {
  const c = cellSize(drawing, cols, rows);
  const xs = [], ys = [];
  for (let i = 0; i <= cols; i++) xs.push(round1(drawing.x + i * c.w));
  for (let j = 0; j <= rows; j++) ys.push(round1(drawing.y + j * c.h));
  return { xs, ys };
}

export const cellPos = (n, cols) => ({ col: n % cols, row: Math.floor(n / cols) });
export function neighbour(n, cols, rows, dc, dr) {
  const { col, row } = cellPos(n, cols);
  const c = col + dc, r = row + dr;
  return c < 0 || c >= cols || r < 0 || r >= rows ? n : r * cols + c;
}

export function nextTodo(n, total, done) {
  for (let k = 1; k <= total; k++) { const m = (n + k) % total; if (!done.includes(m)) return m; }
  return n;
}

const round1 = (v) => Math.round(v * 10) / 10;

export function printTiles(drawing, win, overlap = 10) {
  const stepX = win.w - overlap, stepY = win.h - overlap;
  const cols = Math.max(1, Math.ceil((drawing.w - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((drawing.h - overlap) / stepY));
  const tiles = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    tiles.push({ col, row, x: col * stepX, y: row * stepY });
  }
  return { cols, rows, tiles };
}

export const pxPerMmOfImage = (imgW, drawingW) => imgW / drawingW;
