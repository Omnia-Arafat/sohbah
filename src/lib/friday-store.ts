import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getMe, meKey } from "@/lib/me-store";
import { deviceTimezone, fridayWindow, isKahfPage, kahfBit } from "@/lib/friday";

/**
 * This Friday's count, kept on the phone first.
 *
 * Every tap lands here instantly and survives a reload or a lost connection;
 * the server is told afterwards (`syncFriday`). The server keeps the larger
 * count and the union of pages, so sending the same or an older copy twice
 * never loses anything — which is what lets a tap never wait on the network.
 *
 * Keyed per academy and per Friday: last week's count is never wanted.
 *
 * An external store, read through `useSyncExternalStore`, like me-store.ts.
 */

export type FridayEntry = { salawat: number; kahf: number };

const EMPTY: FridayEntry = { salawat: 0, kahf: 0 };
const cache = new Map<string, FridayEntry>();
const listeners = new Set<() => void>();

export function fridayKey(academySlug: string, friday: string) {
  return `sohbah:friday:${academySlug}:${friday}`;
}

export function getFriday(key: string): FridayEntry {
  const cached = cache.get(key);
  if (cached) return cached;

  let value = EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FridayEntry>;
      value = { salawat: Number(parsed.salawat) || 0, kahf: Number(parsed.kahf) || 0 };
    }
  } catch {
    // Blocked storage: the count still works for this visit.
  }
  cache.set(key, value);
  return value;
}

function write(key: string, value: FridayEntry) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the server copy is the backup.
  }
  listeners.forEach((listener) => listener());
}

/*
  Another tab counting too: its writes arrive as `storage` events, and the
  copy held here must be dropped or this tab's next tap would write its older
  count over the newer one.
*/
function onStorage(event: StorageEvent) {
  if (!event.key?.startsWith("sohbah:friday:")) return;
  cache.delete(event.key);
  listeners.forEach((listener) => listener());
}

export function subscribeFriday(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function addSalawat(key: string, by = 1) {
  const now = getFriday(key);
  write(key, { ...now, salawat: now.salawat + by });
}

export function addKahf(key: string, mask: number) {
  const now = getFriday(key);
  if ((now.kahf | mask) === now.kahf) return;
  write(key, { ...now, kahf: now.kahf | mask });
}

/** Take in what the server holds: never lower, never fewer pages. */
function merge(key: string, remote: FridayEntry) {
  const now = getFriday(key);
  const next = {
    salawat: Math.max(now.salawat, remote.salawat),
    kahf: now.kahf | remote.kahf,
  };
  if (next.salawat !== now.salawat || next.kahf !== now.kahf) write(key, next);
}

export type FridayWho =
  | { kind: "student"; studentId: string; phone: string }
  | { kind: "staff" };

/**
 * Who this browser is, for the challenge: a signed-in معلمة/مشرفة first, else
 * the student صفحتي remembers, else nobody — the count still works, it just
 * stays on this phone.
 */
export async function detectFridayWho(
  academySlug: string,
  supabase: SupabaseClient<Database>,
): Promise<FridayWho | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return { kind: "staff" };
  } catch {
    // Fall through to the student.
  }
  const me = getMe(meKey(academySlug));
  return me ? { kind: "student", studentId: me.studentId, phone: me.phone } : null;
}

/**
 * Send this Friday's copy and take back the merged one. Silent on failure:
 * the local count is untouched and the next sync sends it again.
 */
export async function syncFriday(
  supabase: SupabaseClient<Database>,
  academySlug: string,
  friday: string,
  who: FridayWho,
): Promise<boolean> {
  const key = fridayKey(academySlug, friday);
  const local = getFriday(key);

  const { data, error } =
    who.kind === "student"
      ? await supabase.rpc("friday_challenge_save_student", {
          p_student_id: who.studentId,
          p_phone: who.phone,
          p_friday: friday,
          p_salawat: local.salawat,
          p_kahf: local.kahf,
        })
      : await supabase.rpc("friday_challenge_save_staff", {
          p_friday: friday,
          p_salawat: local.salawat,
          p_kahf: local.kahf,
        });

  if (error) {
    console.error("friday sync failed", error);
    return false;
  }
  const row = data?.[0];
  if (row) merge(key, { salawat: row.salawat, kahf: row.kahf_pages });
  return true;
}

/**
 * Called by the مصحف reader for every page opened: a page of الكهف read
 * between مغرب الخميس and مغرب الجمعة ticks itself.
 */
export async function noteMushafPage(
  academySlug: string,
  page: number,
  supabase: () => SupabaseClient<Database>,
) {
  if (!isKahfPage(page)) return;
  const now = fridayWindow(new Date(), deviceTimezone());
  if (!now.active) return;

  const key = fridayKey(academySlug, now.friday);
  addKahf(key, kahfBit(page));

  const client = supabase();
  const who = await detectFridayWho(academySlug, client);
  if (who) await syncFriday(client, academySlug, now.friday, who);
}
