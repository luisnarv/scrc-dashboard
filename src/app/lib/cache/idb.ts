import { DB_NAME, DB_VERSION, STORE_MONTHS, STORE_META } from './config';

// Envoltorio minimo sobre IndexedDB con Promesas, sin dependencias.
// Seguro en SSR: si no hay window/indexedDB, todas las operaciones degradan a
// no-op (get -> undefined). Asi el repositorio simplemente cae a red.

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => { if (!settled) { settled = true; resolve(db); } };

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      done(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MONTHS)) db.createObjectStore(STORE_MONTHS, { keyPath: 'mes' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = () => done(req.result);
    req.onerror = () => done(null);           // degradar a "sin cache"
    req.onblocked = () => done(null);         // otra conexion bloquea: no colgar
    // Red de seguridad: si el open no resuelve (bloqueo raro), degradamos a red.
    setTimeout(() => done(null), 3000);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = tx(db, store, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const req = tx(db, store, 'readwrite').put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const req = tx(db, store, 'readonly').getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => resolve([]);
  });
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const req = tx(db, store, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

export async function idbClear(store: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const req = tx(db, store, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
