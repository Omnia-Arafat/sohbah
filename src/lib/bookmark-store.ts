/**
 * "Where was I in the mushaf?", kept in the reader's own browser.
 *
 * This was one of the open questions in the design: a student has no account,
 * so there is nowhere on the server to hang a bookmark. The answer is that it
 * does not need one. A bookmark is not a record of anything — it is a
 * convenience for the device she reads on, and if she opens the app on her
 * mother's phone, starting at الفاتحة is the correct behaviour, not a bug.
 *
 * Scoped per academy so two academies on the same device do not fight, and
 * stored as an external store so `useSyncExternalStore` can read it without a
 * state-setting effect — the same pattern as `joined-store.ts` and
 * `me-store.ts`.
 */

export type Bookmark = {
  page: number;
  /** Surah number at the top of that page, so the card can name it. */
  surah: number;
  savedAt: string;
};

const cache = new Map<string, Bookmark | null>();
const listeners = new Set<() => void>();

export function bookmarkKey(academySlug: string) {
  return `sohbah:mushaf:${academySlug}`;
}

export function getBookmark(key: string): Bookmark | null {
  if (cache.has(key)) return cache.get(key) ?? null;

  let value: Bookmark | null = null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Bookmark;
      // A stored page from a future version, or a corrupted one, must not send
      // a reader to a 404. Anything outside the mushaf is treated as absent.
      if (Number.isInteger(parsed?.page) && parsed.page >= 1 && parsed.page <= 604) {
        value = parsed;
      }
    }
  } catch {
    // Private mode or blocked storage: she starts at الفاتحة this visit.
  }

  cache.set(key, value);
  return value;
}

export function setBookmark(key: string, value: Bookmark) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the reader works, it just will not remember the page.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeBookmark(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
