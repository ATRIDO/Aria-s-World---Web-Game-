// Saved paint layers, one PNG per page, in IndexedDB. Stored as ArrayBuffer
// rather than Blob: older Safari versions had bugs storing Blobs in IDB.
// If IndexedDB is unavailable (some private-browsing modes) we keep pictures
// in memory for the session instead.

const DB_NAME = 'arias-world';
const STORE = 'paint';

interface SavedPaint {
  png: ArrayBuffer;
  updated: number;
}

const memory = new Map<string, SavedPaint>();
let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (!settled) {
        settled = true;
        resolve(db);
      }
    };
    // Some Safari builds never fire any event on the first open; don't hang.
    setTimeout(() => done(null), 3000);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function savePaint(pageId: string, png: Blob): Promise<void> {
  const rec: SavedPaint = { png: await png.arrayBuffer(), updated: Date.now() };
  memory.set(pageId, rec);
  const db = await openDb();
  if (db) await request(db, 'readwrite', (s) => s.put(rec, pageId));
}

export async function loadPaint(pageId: string): Promise<Blob | null> {
  const db = await openDb();
  let rec: SavedPaint | undefined = memory.get(pageId);
  if (!rec && db) {
    try {
      rec = await request<SavedPaint | undefined>(db, 'readonly', (s) => s.get(pageId));
    } catch (e) {
      console.warn('[storage] read failed', e);
    }
  }
  return rec ? new Blob([rec.png], { type: 'image/png' }) : null;
}

/** Ids of every saved picture (from this session too, if IndexedDB is unavailable). */
export async function listPaintIds(): Promise<string[]> {
  const ids = new Set(memory.keys());
  const db = await openDb();
  if (db) {
    try {
      const keys = await request<IDBValidKey[]>(db, 'readonly', (s) => s.getAllKeys());
      for (const k of keys) if (typeof k === 'string') ids.add(k);
    } catch (e) {
      console.warn('[storage] listing failed', e);
    }
  }
  return [...ids];
}

export interface SavedPicture {
  pageId: string;
  png: Blob;
  updated: number;
}

/** Every saved picture, newest first (for the gallery). */
export async function listPaint(): Promise<SavedPicture[]> {
  const found = new Map<string, SavedPaint>();
  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          found.set(String(cur.key), cur.value as SavedPaint);
          cur.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[storage] list failed', e);
    }
  }
  // This session's saves win (they may be newer, or IndexedDB may be unavailable).
  for (const [id, rec] of memory) found.set(id, rec);
  return [...found]
    .map(([pageId, rec]) => ({ pageId, png: new Blob([rec.png], { type: 'image/png' }), updated: rec.updated }))
    .sort((a, b) => b.updated - a.updated);
}
