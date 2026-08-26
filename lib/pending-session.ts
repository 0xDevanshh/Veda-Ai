import type { SessionData } from "./types";

// Page images run to many megabytes, which overflows sessionStorage's ~5MB cap.
// IndexedDB has a far larger quota, so it's what we use to hand the uploaded
// pages from the upload screen to the processing screen.
const DB_NAME = "veda-ai";
const DB_VERSION = 2;
const STORE_NAME = "pending-session";
// Completed runs are assembled on the client now that the pipeline is four
// separate round-trips, so the finished SessionData is kept here too — keyed by
// sessionId — rather than re-uploading every page image just to persist it.
const COMPLETED_STORE_NAME = "completed-sessions";
const RECORD_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(COMPLETED_STORE_NAME)) {
        db.createObjectStore(COMPLETED_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = operation(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

export async function savePendingSession(session: SessionData): Promise<void> {
  await runTransaction(STORE_NAME, "readwrite", (store) =>
    store.put(session, RECORD_KEY)
  );
}

export async function loadPendingSession(): Promise<SessionData | null> {
  const session = await runTransaction<SessionData | undefined>(
    STORE_NAME,
    "readonly",
    (store) => store.get(RECORD_KEY)
  );
  return session ?? null;
}

export async function clearPendingSession(): Promise<void> {
  await runTransaction(STORE_NAME, "readwrite", (store) =>
    store.delete(RECORD_KEY)
  );
}

export async function saveCompletedSession(session: SessionData): Promise<void> {
  await runTransaction(COMPLETED_STORE_NAME, "readwrite", (store) =>
    store.put(session, session.sessionId)
  );
}

export async function loadCompletedSession(
  sessionId: string
): Promise<SessionData | null> {
  const session = await runTransaction<SessionData | undefined>(
    COMPLETED_STORE_NAME,
    "readonly",
    (store) => store.get(sessionId)
  );
  return session ?? null;
}
