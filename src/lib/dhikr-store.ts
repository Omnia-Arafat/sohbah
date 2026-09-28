import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { FridayWho } from "@/lib/friday-store";

/**
 * A ذكر challenge's count for this period, kept on the phone first.
 *
 * The same pattern as تحدي الجمعة (friday-store.ts): every tap lands here at
 * once and survives a reload or a lost connection, and the server — which
 * keeps the LARGER count — is told afterwards.
 *
 * Keyed by the challenge's link and the period ("2026-09-28" for a daily one),
 * so yesterday's count is never shown today.
 */

const cache = new Map<string, number>();
const listeners = new Set<() => void>();

export function dhikrKey(slug: string, periodKey: string) {
  return `sohbah:dhikr:${slug}:${periodKey}`;
}

export function getDhikrCount(key: string): number {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let value = 0;
  try {
    value = Number(window.localStorage.getItem(key)) || 0;
  } catch {
    // Blocked storage: the count still works for this visit.
  }
  cache.set(key, value);
  return value;
}

function write(key: string, value: number) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Non-fatal: the server copy is the backup.
  }
  listeners.forEach((listener) => listener());
}

// Another tab counting too: drop this tab's copy so it cannot overwrite.
function onStorage(event: StorageEvent) {
  if (!event.key?.startsWith("sohbah:dhikr:")) return;
  cache.delete(event.key);
  listeners.forEach((listener) => listener());
}

export function subscribeDhikr(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function addDhikr(key: string, by = 1) {
  write(key, getDhikrCount(key) + by);
}

/**
 * Send this period's count and take back the merged one. Silent on failure:
 * the local count stays and the next sync sends it again.
 */
export async function syncDhikr(
  supabase: SupabaseClient<Database>,
  challengeId: string,
  key: string,
  periodKey: string,
  who: FridayWho,
): Promise<boolean> {
  const local = getDhikrCount(key);
  const { data, error } =
    who.kind === "student"
      ? await supabase.rpc("dhikr_challenge_save_student", {
          p_challenge_id: challengeId,
          p_student_id: who.studentId,
          p_phone: who.phone,
          p_period_key: periodKey,
          p_total: local,
        })
      : await supabase.rpc("dhikr_challenge_save_staff", {
          p_challenge_id: challengeId,
          p_period_key: periodKey,
          p_total: local,
        });

  if (error) {
    console.error("dhikr sync failed", error);
    return false;
  }
  const remote = data?.[0]?.total ?? 0;
  if (remote > getDhikrCount(key)) write(key, remote);
  return true;
}
