// Persistence: settings in localStorage, the picture itself in IndexedDB.
// Both can be missing (private mode, blocked storage) — the app still works, just forgets.

const KEY = 'kalka-v1';

export function loadSettings(defaults) {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o ? { ...defaults, ...o } : { ...defaults };
  } catch { return { ...defaults }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kalka', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

// Stored as ArrayBuffer, not Blob: WebKit refuses Blobs in IndexedDB in some modes (private windows).
export const saveFile = async (blob, name) => {
  try {
    const data = await blob.arrayBuffer();
    await tx('readwrite', (s) => s.put({ data, type: blob.type, name }, 'current'));
  } catch { /* storage unavailable: the app works, just forgets */ }
};
/** The last opened file as a File, or null. */
export const loadFile = () => tx('readonly', (s) => s.get('current'))
  .then((o) => {
    if (o?.data) return new File([o.data], o.name, { type: o.type || '' });
    if (o?.blob) return new File([o.blob], o.name, { type: o.blob.type }); // saved by an older version
    return null;
  })
  .catch(() => null);
export const clearFile = () => tx('readwrite', (s) => s.delete('current')).catch(() => {});
