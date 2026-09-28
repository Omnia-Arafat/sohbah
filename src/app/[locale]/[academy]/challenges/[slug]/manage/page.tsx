import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, PauseCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { DhikrBadge } from "@/components/dhikr-badge";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import type { DhikrStatsRow } from "@/lib/database.types";
import { isFamily, periodKey, progressOf, type Family } from "@/lib/dhikr";
import { FALLBACK_TIMEZONE, formatCount } from "@/lib/friday";
import { createClient } from "@/lib/supabase/server";
import { ManageActions } from "./manage-actions";

type ManagePageProps = {
  params: Promise<{ locale: string; academy: string; slug: string }>;
};

export async function generateMetadata({ params }: ManagePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "challenges" });
  return { title: t("manageTitle") };
}

/** Always fresh: counts arrive while it is open. */
export const dynamic = "force-dynamic";

/**
 * A challenge's own page for the one who made it, and for مشرفات: its link to
 * share, how many stand at each stage, who took part in order, and stopping
 * it. "Now" is Cairo's day, where most of the academy is.
 */
export default async function ManagePage({ params }: ManagePageProps) {
  const { locale, academy: academySlug, slug } = await params;
  setRequestLocale(locale);

  const session = await requireTeacherSession(`/${academySlug}/challenges/${slug}/manage`);
  if (!isActiveTeacher(session)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("dhikr_challenge_by_slug", { p_academy_slug: academySlug, p_slug: slug });
  const challenge = data?.[0];
  if (!challenge) notFound();

  const { data: allowed } = await supabase.rpc("dhikr_challenge_can_manage", { p_challenge_id: challenge.id });
  if (allowed !== true) notFound();

  const t = await getTranslations("challenges");
  const key = periodKey(challenge.period, new Date(), FALLBACK_TIMEZONE);
  const { data: stats, error } = await supabase.rpc("dhikr_challenge_stats", {
    p_challenge_id: challenge.id,
    p_period_key: key,
  });
  if (error) console.error("dhikr_challenge_stats failed", error);
  const rows: DhikrStatsRow[] = stats ?? [];

  const family: Family = isFamily(challenge.family) ? challenge.family : "tree";
  const digits = (n: number) => formatCount(n, locale);
  // Where each one stands: anyone who has reached the goal counts as done,
  // whatever her next round is at.
  const reachedStage = (total: number) =>
    total >= challenge.goal ? 4 : progressOf(total, challenge.goal).stage;
  const stageCounts = [1, 2, 3, 4].map((s) => rows.filter((r) => reachedStage(r.person_total) === s).length);

  const kind = { student: t("kindStudent"), teacher: t("kindTeacher"), supervisor: t("kindSupervisor") } as const;
  const periodLabel =
    challenge.period === "day" ? t("todayLabel") : challenge.period === "week" ? t("weekLabel") : t("onceLabel");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <BackLink href={`/${academySlug}/challenges`}>{t("back")}</BackLink>

      <div className="flex flex-col items-center gap-2 rounded-2xl bg-brand-900 p-5 text-center text-white dark:bg-brand-950">
        <DhikrBadge family={family} stage={4} size={88} />
        <h1 className="font-display text-2xl font-bold">{challenge.title}</h1>
        <p className="font-display text-base leading-relaxed text-brand-100">{challenge.dhikr}</p>
      </div>

      <p className="flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
        {challenge.is_active ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        ) : (
          <PauseCircle aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        )}
        {challenge.is_active ? t("published") : t("stopped")}
      </p>

      <ManageActions
        academySlug={academySlug}
        slug={challenge.slug}
        challengeId={challenge.id}
        title={challenge.title}
        isActive={challenge.is_active}
      />

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold">{periodLabel}</h2>
          <span className="text-[11px] text-muted-foreground">{t("atStage")}</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {stageCounts.map((n, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <DhikrBadge family={family} stage={n === 0 ? 0 : i + 1} size={40} />
              <span className="text-sm font-bold">{digits(n)}</span>
            </div>
          ))}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted-foreground">{t("nobody")}</p>
      ) : (
        <ol className="card overflow-hidden p-0">
          {rows.map((row, i) => {
            const stage = reachedStage(row.person_total);
            return (
              <li key={`${row.person_name}-${i}`} className="flex items-center gap-3 border-t border-border-subtle px-3 py-2.5 first:border-t-0">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i < 3 ? "bg-brand-600 text-white" : "bg-surface-muted text-muted-foreground"
                  }`}
                >
                  {digits(i + 1)}
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className="truncate text-sm font-bold">{row.person_name}</span>
                  <span className="text-[11px] text-muted-foreground">{kind[row.person_kind]}</span>
                </span>
                <DhikrBadge family={family} stage={stage} size={30} />
                <span className="min-w-12 shrink-0 text-end font-display text-lg font-bold text-brand-700 dark:text-brand-300">
                  {digits(row.person_total)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[11px] text-muted-foreground">{t("tieNote")}</p>
    </div>
  );
}
