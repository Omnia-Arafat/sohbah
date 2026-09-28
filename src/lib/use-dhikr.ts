"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { deviceTimezone } from "@/lib/friday";
import { detectFridayWho, type FridayWho } from "@/lib/friday-store";
import { periodKey, type Period } from "@/lib/dhikr";
import { dhikrKey, getDhikrCount, subscribeDhikr, syncDhikr } from "@/lib/dhikr-store";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import type { DhikrChallenge } from "@/lib/database.types";

function subscribeMinute(listener: () => void) {
  const timer = setInterval(listener, 30_000);
  return () => clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** Who this browser is counting as — shared by every challenge on a screen. */
export function useDhikrWho(academySlug: string) {
  const supabase = useMemo(() => createClient(), []);
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
  return { who, supabase };
}

/**
 * One challenge's count for the current period on this device's clock, and
 * a `flush` that tells the server. `count` is null until the clock is read on
 * the client, so nothing renders a wrong day's number first.
 */
export function useDhikrCount(
  challenge: { id: string; slug: string; period: Period },
  who: FridayWho | null | undefined,
  supabase: ReturnType<typeof createClient>,
) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, () => null);
  const period =
    minute === null ? null : periodKey(challenge.period, new Date(minute * 60_000), deviceTimezone());
  const key = period ? dhikrKey(challenge.slug, period) : null;

  const count = useSyncExternalStore(
    subscribeDhikr,
    useCallback(() => (key ? getDhikrCount(key) : null), [key]),
    () => null,
  );

  const flush = useCallback(async () => {
    if (!who || !key || !period) return;
    await syncDhikr(supabase, challenge.id, key, period, who);
  }, [who, key, period, supabase, challenge.id]);

  // Once on arrival: catch up with what another device already sent.
  useEffect(() => {
    void flush();
  }, [flush]);

  return { key, count, flush };
}

/**
 * The challenges this reader can see: everyone's, plus her own حلقة's once
 * صفحتي knows who she is (staff see them all). `null` while loading.
 */
export function useDhikrList(academySlug: string) {
  const supabase = useMemo(() => createClient(), []);
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore(subscribeMe, useCallback(() => getMe(key), [key]), () => null);
  const [list, setList] = useState<DhikrChallenge[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("dhikr_challenges_list", {
        p_academy_slug: academySlug,
        p_student_id: me?.studentId ?? null,
        p_phone: me?.phone ?? null,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("dhikr_challenges_list failed", error);
        setList(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [academySlug, me, supabase]);

  return list;
}
