"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DhikrBadge } from "@/components/dhikr-badge";
import type { DhikrChallenge } from "@/lib/database.types";
import { STAGE_NAMES, isFamily, progressOf, type Family } from "@/lib/dhikr";
import { formatCount } from "@/lib/friday";
import type { FridayWho } from "@/lib/friday-store";
import type { createClient } from "@/lib/supabase/client";
import { useDhikrCount } from "@/lib/use-dhikr";

/**
 * One challenge as a line: its badge at the stage she has reached, its name,
 * and how far along she is this period. The whole row opens its counter.
 */
export function ChallengeRow({
  academySlug,
  locale,
  challenge,
  who,
  supabase,
}: {
  academySlug: string;
  locale: string;
  challenge: DhikrChallenge;
  who: FridayWho | null | undefined;
  supabase: ReturnType<typeof createClient>;
}) {
  const t = useTranslations("challenges");
  const { count } = useDhikrCount(challenge, who, supabase);
  const family: Family = isFamily(challenge.family) ? challenge.family : "tree";
  const n = count ?? 0;
  const { stage, pct } = progressOf(n, challenge.goal);
  const periodWord =
    challenge.period === "day" ? t("periodDay") : challenge.period === "week" ? t("periodWeek") : t("periodOnce");

  return (
    <Link
      href={`/${academySlug}/c/${challenge.slug}`}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      <DhikrBadge family={family} stage={stage} size={56} />
      <span className="flex min-w-0 flex-grow flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-bold">{challenge.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {stage === 0 ? t("notStarted") : STAGE_NAMES[family][stage - 1]}
          </span>
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-xs text-muted-foreground">
          {t("progress", {
            count: formatCount(n, locale),
            goal: formatCount(challenge.goal, locale),
            period: periodWord,
          })}
          {challenge.circle_name ? ` · ${t("forCircle", { name: challenge.circle_name })}` : ""}
        </span>
      </span>
    </Link>
  );
}
