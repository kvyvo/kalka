// Known screens: physical panel size in mm and the CSS-px modes the OS can report.
// px/mm = CSS px across the whole screen / panel mm — true for any scaled mode.
// Panel mm = native px / ppi × 25.4. A signature can match several screens
// (MBA 13 "more space" == MBA 15 default), so we return candidates and the user confirms.

const mm = (px, ppi) => Math.round((px / ppi) * 25.4 * 10) / 10;

// [id, name, native w, native h, ppi, modes [w, h, dpr] — default first, notch pt]
const RAW = [
  ['mba13m2', 'MacBook Air 13″ (2022+)', 2560, 1664, 224, [[1470, 956, 2], [1280, 832, 2], [1710, 1112, 2]], 32],
  ['mba15', 'MacBook Air 15″', 2880, 1864, 224, [[1710, 1112, 2], [1440, 932, 2], [1920, 1243, 2]], 32],
  ['mba13m1', 'MacBook Air 13″ / Pro 13″ (2016–2020)', 2560, 1600, 227, [[1440, 900, 2], [1280, 800, 2], [1680, 1050, 2]], 0],
  ['mbp14', 'MacBook Pro 14″ (2021+)', 3024, 1964, 254, [[1512, 982, 2], [1352, 878, 2], [1800, 1169, 2]], 32],
  ['mbp16', 'MacBook Pro 16″ (2021+)', 3456, 2234, 254, [[1728, 1117, 2], [1496, 967, 2], [2056, 1329, 2]], 38],
  ['mbp16i', 'MacBook Pro 16″ (2019)', 3072, 1920, 226, [[1536, 960, 2], [1792, 1120, 2]], 0],
  ['mbp15', 'MacBook Pro 15″ (2016–2019)', 2880, 1800, 220, [[1680, 1050, 2], [1440, 900, 2]], 0],
  ['ipad11', 'iPad Air 11″ / iPad 10.9″', 1640, 2360, 264, [[820, 1180, 2]], 0],
  ['ipadpro11', 'iPad Pro 11″ (M4)', 1668, 2420, 264, [[834, 1210, 2]], 0],
  ['ipadpro13', 'iPad Pro 13″ (M4)', 2064, 2752, 264, [[1032, 1376, 2]], 0],
  ['ipad129', 'iPad Pro 12.9″ / iPad Air 13″', 2048, 2732, 264, [[1024, 1366, 2]], 0],
  ['ipadmini', 'iPad mini', 1488, 2266, 326, [[744, 1133, 2]], 0],
  ['surface13', 'Surface Pro 13″', 2880, 1920, 266, [[1440, 960, 2]], 0],
  ['surfacel15', 'Surface Laptop 15″', 2496, 1664, 200, [[1664, 1109, 1.5]], 0],
];

export const SCREENS = RAW.map(([id, name, pw, ph, ppi, modes, notch]) => ({
  id, name, modes, notch, w: mm(pw, ppi), h: mm(ph, ppi),
}));

/** Signature of the current screen: iOS reports portrait always, so sort sides. */
export function signature(w, h, dpr) {
  return `${Math.max(w, h)}x${Math.min(w, h)}@${Math.round(dpr * 100) / 100}`;
}

/** The screen's mode for this CSS size; the short side may be off by ≤1 % (some browsers trim it). */
function modeOf(s, w, h, dpr) {
  const a = Math.max(w, h), b = Math.min(w, h);
  return s.modes.find(([mw, mh, md]) => Math.max(mw, mh) === a && Math.abs(Math.min(mw, mh) - b) <= b * 0.01
    && (dpr === undefined || Math.abs(md - dpr) < 0.01));
}

/** Screens whose modes include this CSS size; screens where it's the default mode come first. */
export function candidates(w, h, dpr) {
  const idx = (s) => s.modes.indexOf(modeOf(s, w, h, dpr));
  return SCREENS.filter((s) => modeOf(s, w, h, dpr)).sort((a, b) => idx(a) - idx(b));
}

/**
 * Base px/mm (before the user's card correction) for a screen of `w`×`h` CSS px.
 * `source` is a known screen or `{diag}` in inches; falls back to CSS 96 dpi.
 * Returns separate x/y scales: some scaled modes have non-square pixels.
 */
export function baseScale(source, w, h) {
  const long = Math.max(w, h), short = Math.min(w, h);
  if (source && source.w) {
    const m = modeOf(source, w, h), shortCss = m ? Math.min(m[0], m[1]) : short;
    const kl = long / Math.max(source.w, source.h), ks = shortCss / Math.min(source.w, source.h);
    return w >= h ? { x: kl, y: ks } : { x: ks, y: kl };
  }
  if (source && source.diag > 0) {
    const k = Math.hypot(w, h) / (source.diag * 25.4);
    return { x: k, y: k };
  }
  return { x: 96 / 25.4, y: 96 / 25.4 };
}

/** Physical size of the screen in mm for a given scale. */
export const screenMm = (w, h, k) => ({ w: w / k.x, h: h / k.y });
