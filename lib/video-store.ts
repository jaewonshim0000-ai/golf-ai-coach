/**
 * Swing clips, stored on the device.
 *
 * ponytail: IndexedDB, not a bucket. This app has no file storage - demo mode
 * is process memory and the Supabase path has no storage bucket wired up - so a
 * recorded clip lives in the browser that recorded it and nowhere else. The
 * record is the shape a bucket would hold, so the upgrade is replacing these
 * three functions with uploads and putting the URL on `swing_sessions`. Until
 * then the UI says on screen that the clip is device-local.
 */

const DB_NAME = "golf-swings";
const STORE = "clips";

export type Clip = {
  /** The swing session id, so a clip is found by the row it belongs to. */
  id: string;
  blob: Blob;
  /** Trim, in seconds. `end` of 0 means "play to the end of the clip". */
  start: number;
  end: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const getClip = (id: string) => run<Clip | undefined>("readonly", (s) => s.get(id));
export const putClip = (clip: Clip) => run<unknown>("readwrite", (s) => s.put(clip));
export const deleteClip = (id: string) => run<unknown>("readwrite", (s) => s.delete(id));

/** Shortest clip worth keeping. Below this a trim is a mis-drag, not a choice. */
const MIN_CLIP = 0.2;

/**
 * Keep a trim inside the clip and the right way round. A dragged handle can
 * arrive inverted, negative, or past a duration the browser reports as NaN
 * before metadata loads, and any of those would save a clip that plays nothing.
 */
export function clampClip(start: number, end: number, duration: number): [number, number] {
  const span = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const lo = Math.min(Math.max(0, start), span);
  const hi = Math.min(Math.max(0, end), span);
  if (hi - lo < MIN_CLIP) return [0, 0];
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}

/** The window to actually play: a stored trim, or the whole clip. */
export function clipWindow(clip: Clip | null, duration: number): [number, number] {
  if (!clip || clip.end <= clip.start) return [0, duration];
  return [clip.start, clip.end];
}
