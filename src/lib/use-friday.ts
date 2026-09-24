"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { deviceTimezone, fridayWindow, type FridayWindow } from "@/lib/friday";
import {
  detectFridayWho,
  fridayKey,
  getFriday,
  subscribeFriday,
  syncFriday,
  type FridayEntry,
  type FridayWho,
} from "@/lib/friday-store";

/** A clock that ticks once a minute — enough to notice مغرب arriving. */
function subscribeMinute(listener: () => void) {
  const timer = setInterval(listener, 30_000);
  return () => clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

/**
 * Everything a تحدي الجمعة screen reads: the window on this device's clock,
 * this Friday's count, who is counting, and a `flush` that tells the server.
 *
 * `window` is null on the server and on the first client render — the clock
 * and the count both live in the browser — so a screen renders nothing time-
 * dependent until it arrives, instead of flashing the wrong state.
 */
export function useFriday(academySlug: string) {
  const supabase = useMemo(() => createClient(), []);

  const minute = useSyncExternalStore(subscribeMinute, minuteNow, () => null);
  const window: FridayWindow | null = useMemo(
    () => (minute === null ? null : fridayWindow(new Date(minute * 60_000), deviceTimezone())),
    [minute],
  );

  const key = window ? fridayKey(academySlug, window.friday) : null;
  const entry: FridayEntry = useSyncExternalStore(
    subscribeFriday,
    useCallback(() => (key ? getFriday(key) : EMPTY), [key]),
    () => EMPTY,
  );

  // undefined = still finding out; null = nobody this browser knows.
  const [who, setWho] = useState<FridayWho | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    detectFridayWho(academySlug, supabase).then((found) => {
      if (!cancelled) setWho(found);
    });
    return () => {
      cancelled = true;
    };
  }, [academySlug, supabase]);

  const friday = window?.friday ?? null;
  const flush = useCallback(async () => {
    if (!who || !friday) return;
    await syncFriday(supabase, academySlug, friday, who);
  }, [who, friday, supabase, academySlug]);

  // Once on arrival: catch up with whatever another device already sent.
  useEffect(() => {
    if (window?.active) void flush();
  }, [flush, window?.active]);

  return { window, key, entry, who, flush, supabase };
}

const EMPTY: FridayEntry = { salawat: 0, kahf: 0 };
