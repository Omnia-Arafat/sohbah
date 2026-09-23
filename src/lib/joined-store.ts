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

/**
 * Forget which student this browser is.
 *
 * Used when the معلمة removes her from today's queue: the row is gone, but
 * this browser would otherwise go on believing she is registered — which left
 * «الدخول إلى الحلقة» unlocked for a student who is no longer in the circle,
 * and hid the search box she needs to put her name back.
 */
export function clearJoined(key: string) {
  cache.set(key, null);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same as `setJoined`: memory is enough for the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeJoined(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * "Who am I", kept across circles and across days.
 *
 * `joinedKey` above is scoped to one circle on one date, and rightly so: it
 * answers "am I in TODAY's queue here", which must expire. But it was also
 * carrying the student's identity, so the same girl was asked to find her own
 * name again in every other circle, and again the next morning — a search
 * through the academy's whole roster, every time, for something she had
 * already told us.
 *
 * Identity does not expire, so it gets its own key, scoped to the academy
 * rather than to a circle or a day. Still browser-only: students have no
 * accounts, and this is a convenience for a device, not a claim about who
 * someone is — every write the queue makes is still keyed by the student id
 * the server resolved, never by this.
 */
export function meKey(academySlug: string) {
  return `sohbah:me:${academySlug}`;
}
