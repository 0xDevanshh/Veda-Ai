import type { SessionData } from "./types";

// Page images run to many megabytes, which overflows sessionStorage's ~5MB cap.
// IndexedDB has a far larger quota, so it's what we use to hand the uploaded
// pages from the upload screen to the processing screen.
const DB_NAME = "veda-ai";
const DB_VERSION = 1;
const STORE_NAME = "pending-session";
const RECORD_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

export async function savePendingSession(session: SessionData): Promise<void> {
  await runTransaction("readwrite", (store) => store.put(session, RECORD_KEY));
}

export async function loadPendingSession(): Promise<SessionData | null> {
  const session = await runTransaction<SessionData | undefined>(
    "readonly",
    (store) => store.get(RECORD_KEY)
  );
  return session ?? null;
}

export async function clearPendingSession(): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(RECORD_KEY));
}
