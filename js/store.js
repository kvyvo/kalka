const KEY = 'kalka-v1';

export function loadSettings(defaults) {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o ? { ...defaults, ...o } : { ...defaults };
  } catch { return { ...defaults }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {  }
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

export const saveFile = async (blob, name) => {
  try {
    const data = await blob.arrayBuffer();
    await tx('readwrite', (s) => s.put({ data, type: blob.type, name }, 'current'));
  } catch {  }
};
export const loadFile = () => tx('readonly', (s) => s.get('current'))
  .then((o) => {
    if (o?.data) return new File([o.data], o.name, { type: o.type || '' });
    if (o?.blob) return new File([o.blob], o.name, { type: o.blob.type });
    return null;
  })
  .catch(() => null);
export const clearFile = () => tx('readwrite', (s) => s.delete('current')).catch(() => {});
