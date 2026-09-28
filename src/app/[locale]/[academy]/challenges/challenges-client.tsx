"use client";

import { Plus, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChallengeRow } from "@/components/challenge-row";
import { FridayCard } from "@/components/friday-card";
import { useDhikrList, useDhikrWho } from "@/lib/use-dhikr";

export function ChallengesClient({
  academySlug,
  locale,
  isStaff,
  canSupervise,
}: {
  academySlug: string;
  locale: string;
  isStaff: boolean;
  canSupervise: boolean;
}) {
  const t = useTranslations("challenges");
  const list = useDhikrList(academySlug);
  const { who, supabase } = useDhikrWho(academySlug);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isStaff && (
          <Link href={`/${academySlug}/challenges/new`} className="btn-primary shrink-0 px-4 py-2 text-sm">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("newChallenge")}
          </Link>
        )}
      </div>

      {/* On a Friday, تحدي الجمعة comes first: it renders only then. */}
      <FridayCard academySlug={academySlug} locale={locale} />

      {list === null ? (
        <div className="h-20 animate-pulse rounded-2xl bg-surface-muted" />
      ) : list.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted-foreground">
          {isStaff ? t("emptyStaff") : t("empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((challenge) => (
            <ChallengeRow
              key={challenge.id}
              academySlug={academySlug}
              locale={locale}
              challenge={challenge}
              who={who}
              supabase={supabase}
            />
          ))}
        </div>
      )}

      {canSupervise && (
        <Link
          href={`/${academySlug}/admin/challenges`}
          className="inline-flex items-center gap-2 self-center text-xs font-semibold text-brand-700 dark:text-brand-300"
        >
          <Trophy aria-hidden="true" className="h-4 w-4" />
          {t("fridayBoard")}
        </Link>
      )}
    </div>
  );
}
