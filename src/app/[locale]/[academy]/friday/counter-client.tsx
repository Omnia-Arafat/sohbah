"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FridayBadge } from "@/components/friday-badge";
import {
  earnedMilestones,
  formatCount,
  isMilestone,
  nextMilestone,
  previousMilestone,
} from "@/lib/friday";
import { addSalawat, getFriday } from "@/lib/friday-store";
import { useFriday } from "@/lib/use-friday";
import { FridayClosed, FridayHeader } from "./friday-parts";

/** How long after the last tap the count is sent. */
const FLUSH_AFTER_MS = 1500;

export function CounterClient({ academySlug, locale }: { academySlug: string; locale: string }) {
  const t = useTranslations("friday");
  const { window, key, entry, flush } = useFriday(academySlug);
  const [earned, setEarned] = useState<number | null>(null);

  /*
    Taps are counted at once and sent in a batch: a phone firing an RPC per
    tap at two taps a second is a phone on a bad connection falling behind.
    The server keeps the larger count, so a batch that arrives twice or late
    is harmless.
  */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), FLUSH_AFTER_MS);
  }, [flush]);

  // Leaving the screen or the app sends whatever is pending, right away.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") void flush();
    }
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    };
  }, [flush]);

  function tap() {
    if (!key) return;
    addSalawat(key);
    const count = getFriday(key).salawat;
    if (isMilestone(count)) {
      setEarned(count);
      navigator.vibrate?.([30, 40, 30]);
    } else {
      navigator.vibrate?.(8);
    }
    flushSoon();
  }

  if (!window) return null;

  const count = entry.salawat;
  const next = nextMilestone(count);
  const prev = previousMilestone(count);
  const pct = Math.round(((count - prev) / (next - prev)) * 100);
  const badges = earnedMilestones(count);
  const digits = (n: number) => formatCount(n, locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <FridayHeader academySlug={academySlug} title={t("salawatTitle")} subtitle={t("counterSubtitle")} />

      {!window.active ? (
        <FridayClosed startsAt={window.startsAt} locale={locale} />
      ) : (
        <>
          <p className="text-center font-display text-lg text-brand-700 dark:text-brand-300">
            {t("salawatText")}
          </p>

          {/* The whole circle is the button: a thumb should never have to aim. */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={tap}
              aria-label={t("tapLabel")}
              className="flex h-56 w-56 select-none flex-col items-center justify-center gap-1 rounded-full
                         border-8 border-brand-100 bg-brand-600 text-white shadow-lg transition-transform
                         active:scale-[0.97] dark:border-brand-800"
              style={{ touchAction: "manipulation" }}
            >
              <span aria-live="polite" className="font-display text-6xl font-bold leading-none">
                {digits(count)}
              </span>
              <span className="text-sm text-brand-100">{t("tapHint")}</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              {t("toNext", { left: digits(next - count), next: digits(next) })}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {earned !== null && (
            <div
              role="status"
              className="motion-sheet flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950/50"
            >
              <FridayBadge milestone={earned} size={56} />
              <span className="min-w-0 flex-grow">
                <span className="block text-sm font-bold">{t("newBadge", { count: digits(earned) })}</span>
                <span className="block text-xs text-muted-foreground">{t("newBadgeNote")}</span>
              </span>
              <Link href={`/${academySlug}/friday/share`} className="btn-primary shrink-0 px-3 py-2 text-xs">
                {t("shareIt")}
              </Link>
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{t("myBadges")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((m) => (
                <FridayBadge key={m} milestone={m} size={44} label={t("badgeLabel", { count: digits(m) })} />
              ))}
              <FridayBadge milestone={next} size={44} locked label={t("nextBadgeLabel", { count: digits(next) })} />
            </div>
          </section>

          <Link href={`/${academySlug}/friday/share`} className="btn-primary w-full gap-2">
            <Share2 aria-hidden="true" className="h-4 w-4" />
            {t("shareShort")}
          </Link>
        </>
      )}
    </div>
  );
}
