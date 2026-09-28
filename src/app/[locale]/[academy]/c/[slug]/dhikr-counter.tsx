"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { DhikrBadge } from "@/components/dhikr-badge";
import { Link } from "@/i18n/navigation";
import type { DhikrChallengeBySlug } from "@/lib/database.types";
import { STAGE_NAMES, isFamily, progressOf, type Family } from "@/lib/dhikr";
import { addDhikr, getDhikrCount } from "@/lib/dhikr-store";
import { formatCount } from "@/lib/friday";
import { useDhikrCount, useDhikrWho } from "@/lib/use-dhikr";
import { FridayNotKnown } from "../../friday/friday-parts";

/** How long after the last tap the count is sent. */
const FLUSH_AFTER_MS = 1500;

/**
 * The counter for one ذكر.
 *
 * The badge IS the progress: the tree grows, the chest opens, the fortress
 * rises as she counts. Past the goal a new round begins rather than the count
 * stopping — for غراس الجنة that is a second tree.
 */
export function DhikrCounter({
  academySlug,
  locale,
  challenge,
  canManage,
}: {
  academySlug: string;
  locale: string;
  challenge: DhikrChallengeBySlug;
  canManage: boolean;
}) {
  const t = useTranslations("challenges");
  const { who, supabase } = useDhikrWho(academySlug);
  const { key, count, flush } = useDhikrCount(challenge, who, supabase);
  const [copied, setCopied] = useState(false);

  const family: Family = isFamily(challenge.family) ? challenge.family : "tree";
  const digits = (n: number) => formatCount(n, locale);
  const every =
    challenge.period === "day" ? t("everyDay") : challenge.period === "week" ? t("everyWeek") : t("everyOnce");

  // Taps are counted at once and sent in a batch, as on the Friday counter.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), FLUSH_AFTER_MS);
  }, [flush]);

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
    const before = progressOf(getDhikrCount(key), challenge.goal).stage;
    addDhikr(key);
    const after = progressOf(getDhikrCount(key), challenge.goal).stage;
    navigator.vibrate?.(after !== before ? [30, 40, 30] : 8);
    flushSoon();
  }

  async function share() {
    const url = window.location.href;
    const text = t("shareText", { title: challenge.title });
    if (navigator.share) {
      try {
        await navigator.share({ title: challenge.title, text, url });
        return;
      } catch {
        // Closed the sheet, or not allowed: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is in the address bar either way.
    }
  }

  const n = count ?? 0;
  const { stage, rounds } = progressOf(n, challenge.goal);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <BackLink href={`/${academySlug}/challenges`}>{t("back")}</BackLink>

      <div>
        <h1 className="font-display text-2xl font-bold">{challenge.title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("goalLine", { goal: digits(challenge.goal), every })}
          {challenge.circle_name ? ` · ${t("forCircle", { name: challenge.circle_name })}` : ""}
        </p>
      </div>

      <p className="text-center font-display text-xl leading-relaxed text-brand-800 dark:text-brand-200">
        {challenge.dhikr}
      </p>

      {!challenge.is_active ? (
        <p className="card p-5 text-center text-sm text-muted-foreground">{t("ended")}</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1">
            <DhikrBadge family={family} stage={count === null ? 0 : stage} size={140} />
            <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
              {stage === 0 ? t("notStarted") : STAGE_NAMES[family][stage - 1]}
            </span>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={tap}
              disabled={count === null}
              aria-label={t("tapLabel")}
              className="flex h-44 w-44 select-none flex-col items-center justify-center gap-1 rounded-full
                         border-8 border-brand-100 bg-brand-600 text-white shadow-lg transition-transform
                         active:scale-[0.97] disabled:opacity-60 dark:border-brand-800"
              style={{ touchAction: "manipulation" }}
            >
              <span aria-live="polite" className="font-display text-5xl font-bold leading-none">
                {digits(n)}
              </span>
              <span className="text-xs text-brand-100">{t("of", { goal: digits(challenge.goal) })}</span>
            </button>
          </div>

          {rounds > 0 && (
            <p className="text-center text-sm font-bold text-brand-700 dark:text-brand-300">
              {rounds === 1 ? t("roundsOne") : t("roundsMany", { count: digits(rounds) })}
            </p>
          )}
        </>
      )}

      {challenge.virtue && (
        <figure className="rounded-2xl bg-surface-muted p-4">
          <blockquote className="text-sm leading-loose">{challenge.virtue}</blockquote>
          <figcaption className="mt-1 text-xs text-muted-foreground">{challenge.source}</figcaption>
        </figure>
      )}

      <button type="button" onClick={share} className="btn-primary w-full">
        <Share2 aria-hidden="true" className="h-4 w-4" />
        {copied ? t("copied") : t("share")}
      </button>

      {canManage && (
        <Link href={`/${academySlug}/challenges/${challenge.slug}/manage`} className="btn-secondary w-full">
          <Settings2 aria-hidden="true" className="h-4 w-4" />
          {t("manage")}
        </Link>
      )}

      {challenge.is_active && who === null && <FridayNotKnown academySlug={academySlug} />}
    </div>
  );
}
