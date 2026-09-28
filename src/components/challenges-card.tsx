"use client";

import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChallengeRow } from "@/components/challenge-row";
import { useDhikrList, useDhikrWho } from "@/lib/use-dhikr";

/** How many challenges the home card shows before "كل التحديات". */
const SHOWN = 2;

/**
 * The challenges on the home screen and the staff dashboard: the newest two
 * running, and the way to the rest. Renders nothing when none are running —
 * an empty card saying so is a card people learn to scroll past.
 *
 * تحدي الجمعة is not in here: on a Friday it has its own card, above this
 * one, because on that day it comes first.
 */
export function ChallengesCard({ academySlug, locale }: { academySlug: string; locale: string }) {
  const t = useTranslations("challenges");
  const list = useDhikrList(academySlug);
  const { who, supabase } = useDhikrWho(academySlug);

  if (!list || list.length === 0) return null;

  return (
    <section aria-labelledby="challenges-card" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="challenges-card" className="text-sm font-bold">
          {t("cardTitle")}
        </h2>
        <Link
          href={`/${academySlug}/challenges`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300"
        >
          {t("cardMore")}
          <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 ltr:rotate-180" />
        </Link>
      </div>
      {list.slice(0, SHOWN).map((challenge) => (
        <ChallengeRow
          key={challenge.id}
          academySlug={academySlug}
          locale={locale}
          challenge={challenge}
          who={who}
          supabase={supabase}
        />
      ))}
    </section>
  );
}
