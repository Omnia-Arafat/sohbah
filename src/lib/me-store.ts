/**
 * "Which student am I?", remembered across visits.
 *
 * Students have no accounts, so there is no session to hang this on. What
 * there is instead is her phone number, which the database treats as her
 * credential (see supabase/migrations/20260913120000_student_self_service.sql)
 * — every read of her own record passes it and is refused without it.
 *
 * So this is what is kept in her own browser: her id, her name, and the phone
 * she typed. All three are hers, none of it is anyone else's, and it never
 * leaves her device except back to the API that already required it.
 *
 * Scoped per academy, and holding one student at a time: a shared family phone
 * is normal here, and "خروج" has to actually let the next sister in.
 *
 * Built as an external store rather than component state so it can be read
 * through `useSyncExternalStore` — that keeps the server render (always null)
 * and the first client render consistent without a state-setting effect, the
 * same way `joined-store.ts` does for the circle page.
 */

export type Me = {
  studentId: string;
  name: string;
  fatherName: string;
  /** As she typed it. The API normalises; this is only for sending back. */
  phone: string;
};

const cache = new Map<string, Me | null>();
const listeners = new Set<() => void>();

export function meKey(academySlug: string) {
  return `sohbah:me:${academySlug}`;
}

export function getMe(key: string): Me | null {
  if (cache.has(key)) return cache.get(key) ?? null;

  let value: Me | null = null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as Me;
  } catch {
    // Private mode or blocked storage: she signs in again this visit.
  }

  cache.set(key, value);
  return value;
}

export function setMe(key: string, value: Me) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the page works, it just will not remember her next time.
  }
  listeners.forEach((listener) => listener());
}

export function clearMe(key: string) {
  cache.set(key, null);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do — the in-memory cache above is already cleared.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeMe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
