const DB_NAME = 'push-az';
const DB_VERSION = 2;
const STORE_REMINDERS = 'reminders';
const STORE_CONFIG = 'config';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_REMINDERS)) {
        const store = db.createObjectStore(STORE_REMINDERS, { keyPath: 'id' });
        store.createIndex('fireAt', 'fireAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async getAll() {
    const store = await tx(STORE_REMINDERS, 'readonly');
    return req(store.getAll());
  },
  async get(id) {
    const store = await tx(STORE_REMINDERS, 'readonly');
    return req(store.get(id));
  },
  async put(reminder) {
    const store = await tx(STORE_REMINDERS, 'readwrite');
    return req(store.put(reminder));
  },
  async delete(id) {
    const store = await tx(STORE_REMINDERS, 'readwrite');
    return req(store.delete(id));
  },
  async clear() {
    const store = await tx(STORE_REMINDERS, 'readwrite');
    return req(store.clear());
  },
};

export const config = {
  async get(key, fallback = null) {
    const store = await tx(STORE_CONFIG, 'readonly');
    const row = await req(store.get(key));
    return row ? row.value : fallback;
  },
  async set(key, value) {
    const store = await tx(STORE_CONFIG, 'readwrite');
    return req(store.put({ key, value }));
  },
  async getAll() {
    const store = await tx(STORE_CONFIG, 'readonly');
    const rows = await req(store.getAll());
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
