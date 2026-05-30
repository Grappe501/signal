/**
 * IndexedDB cache for self-hosted audio (offline re-listen).
 */
const AudioCache = (() => {
  const DB_NAME = "signal-reader-audio";
  const STORE = "blobs";
  const DB_VERSION = 1;
  let dbPromise = null;
  const objectUrls = new Map();

  function enabled(getSettings) {
    return getSettings?.()?.audioCache !== false;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
    return dbPromise;
  }

  async function get(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(key, blob) {
    const db = await openDb();
    if (!db || !blob) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function revokeUrl(key) {
    const url = objectUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(key);
    }
  }

  async function resolvePlayableUrl(path, useCache = true) {
    const key = path.replace(/^\//, "");
    if (!useCache) return path;

    if (objectUrls.has(key)) return objectUrls.get(key);

    const cached = await get(key);
    if (cached) {
      const url = URL.createObjectURL(cached);
      objectUrls.set(key, url);
      return url;
    }

    const res = await fetch(path);
    if (!res.ok) throw new Error(`Audio fetch failed ${res.status}`);
    const blob = await res.blob();
    put(key, blob).catch(() => {});
    const url = URL.createObjectURL(blob);
    objectUrls.set(key, url);
    return url;
  }

  async function prefetch(paths, useCache = true) {
    if (!useCache || !paths?.length) return;
    for (const p of paths.slice(0, 12)) {
      try {
        await resolvePlayableUrl(p.startsWith("/") ? p : `/${p}`);
      } catch {
        /* skip */
      }
    }
  }

  function clearObjectUrls() {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
  }

  return {
    enabled,
    resolvePlayableUrl,
    prefetch,
    clearObjectUrls,
  };
})();

window.AudioCache = AudioCache;
