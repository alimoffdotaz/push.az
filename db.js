const DB_NAME = 'push-az';
const DB_VERSION = 1;
const STORE = 'reminders';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('fireAt', 'fireAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async getAll() {
    const store = await tx('readonly');
    return req(store.getAll());
  },
  async get(id) {
    const store = await tx('readonly');
    return req(store.get(id));
  },
  async put(reminder) {
    const store = await tx('readwrite');
    return req(store.put(reminder));
  },
  async delete(id) {
    const store = await tx('readwrite');
    return req(store.delete(id));
  },
  async clear() {
    const store = await tx('readwrite');
    return req(store.clear());
  },
};
