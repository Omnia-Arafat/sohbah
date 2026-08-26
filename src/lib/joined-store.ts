/**
 * "Which student am I?" for the public circle page.
 *
 * Students never sign in, so this lives in the browser only. It is an external
 * store rather than component state so it can be read with
 * `useSyncExternalStore` — that keeps the server render (always null) and the
 * client render consistent without a state-setting effect.
 */

export type Joined = { studentId: string; name: string };

// Memoised per key so getSnapshot returns a stable reference; returning a
// freshly parsed object each call would loop forever.
const cache = new Map<string, Joined | null>();
const listeners = new Set<() => void>();

/** Scoped per circle and per day, so yesterday's answer never leaks into today. */
export function joinedKey(slug: string, sessionDate: string) {
  return `sohbah:joined:${slug}:${sessionDate}`;
}

export function getJoined(key: string): Joined | null {
  if (cache.has(key)) return cache.get(key) ?? null;

  let value: Joined | null = null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as Joined;
  } catch {
    // Private mode or blocked storage: fall back to memory for this session.
  }

  cache.set(key, value);
  return value;
}

export function setJoined(key: string, value: Joined) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the queue still highlights the student until they reload.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeJoined(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
