import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { FridayBadge } from "@/components/friday-badge";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireSupervisorSession } from "@/lib/auth/dal";
import type { FridayBoardRow } from "@/lib/database.types";
import {
  FALLBACK_TIMEZONE,
  KAHF_ALL,
  KAHF_PAGES,
  addDays,
  formatCount,
  fridayWindow,
  isFridayKey,
  kahfCount,
  latestFriday,
  topMilestone,
} from "@/lib/friday";
import { createClient } from "@/lib/supabase/server";

type ChallengesPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ friday?: string; who?: string }>;
};

/** Who can be shown on the board, and the row kinds each filter keeps. */
const FILTERS = {
  all: null,
  students: "student",
  teachers: "teacher",
  supervisors: "supervisor",
} as const;
type Filter = keyof typeof FILTERS;

/** The badges the "how many reached" strip counts. */
const STRIP = [50, 100, 200, 300, 500, 1000];

/** Always fresh: the board is read while the challenge is running. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ChallengesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friday.board" });
  return { title: t("title") };
}

/**
 * التحديات — who did تحدي الجمعة, in order.
 *
 * For مشرفات only, deliberately. A student sees her own badges and never a
 * ranking of others: the one with ٦٠ should not open the app to find herself
 * at the bottom of a list, and a worship should not become a contest in front
 * of everyone. Sharing to the group is each one's own choice.
 *
 * One Friday at a time, flipped with the arrows — the same "focused item"
 * pattern as the weeks of a مسار.
 *
 * "Now" is read in Cairo's time, where most of the academy is; each student's
 * own window still ends at her own مغرب on her device.
 */
export default async function ChallengesPage({ params, searchParams }: ChallengesPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  await requireSupervisorSession(`/${academySlug}/admin/challenges`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("friday.board");
  const query = await searchParams;

  const latest = latestFriday(new Date(), FALLBACK_TIMEZONE);
  const friday = isFridayKey(query.friday) && query.friday <= latest ? query.friday : latest;
  const filter: Filter = query.who && query.who in FILTERS ? (query.who as Filter) : "all";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("friday_challenge_board", {
    p_academy_id: academy.id,
    p_friday: friday,
  });
  if (error) console.error("friday_challenge_board failed", error);
  const everyone: FridayBoardRow[] = data ?? [];

  const kind = FILTERS[filter];
  const rows = kind ? everyone.filter((row) => row.kind === kind) : everyone;

  const numberLocale = locale === "ar" ? "ar-EG" : "en-US";
  const digits = (n: number) => formatCount(n, locale);
  const [y, m, d] = friday.split("-").map(Number);
  const fridayLabel = new Intl.DateTimeFormat(numberLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));

  const isLatest = friday === latest;
  const now = fridayWindow(new Date(), FALLBACK_TIMEZONE);
  const running = now.active && now.friday === friday;
  const href = (next: { friday?: string; who?: Filter }) => {
    const params = new URLSearchParams();
    const f = next.friday ?? friday;
    const w = next.who ?? filter;
    if (f !== latest) params.set("friday", f);
    if (w !== "all") params.set("who", w);
    const qs = params.toString();
    return `/${academySlug}/admin/challenges${qs ? `?${qs}` : ""}`;
  };

  const total = rows.reduce((sum, row) => sum + row.salawat, 0);
  const kahfDone = rows.filter((row) => row.kahf_pages === KAHF_ALL).length;
  const kindLabel = {
    student: t("kindStudent"),
    teacher: t("kindTeacher"),
    supervisor: t("kindSupervisor"),
  } as const;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <BackLink href={`/${academySlug}/admin`}>{t("subtitle")}</BackLink>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>

      {/* One Friday in focus. */}
      <nav className="flex items-center gap-2" aria-label={t("subtitle")}>
        <Link
          href={href({ friday: addDays(friday, -7) })}
          aria-label={t("prev")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface text-brand-700 dark:text-brand-300"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
        </Link>
        <div className="flex-grow text-center">
          <p className="font-bold">{fridayLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            {running ? t("live") : t("past")}
          </p>
        </div>
        {isLatest ? (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-muted-foreground/40"
          >
            <ChevronLeft className="h-4 w-4 ltr:rotate-180" />
          </span>
        ) : (
          <Link
            href={href({ friday: addDays(friday, 7) })}
            aria-label={t("next")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface text-brand-700 dark:text-brand-300"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
          </Link>
        )}
      </nav>
      {!isLatest && (
        <Link href={href({ friday: latest })} className="self-center text-xs font-semibold text-brand-700 dark:text-brand-300">
          {t("backToLatest")}
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          [rows.length, t("joined")],
          [kahfDone, t("kahfDone")],
          [total, t("salawat")],
        ].map(([value, label]) => (
          <div key={label as string} className="card p-3 text-center">
            <p className="font-display text-2xl font-bold leading-tight text-brand-700 dark:text-brand-300">
              {digits(value as number)}
            </p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* How many reached each badge: the shape of the day at a glance. */}
      <div className="card flex justify-between gap-1 overflow-x-auto p-3">
        {STRIP.map((milestone) => {
          const reached = rows.filter((row) => row.salawat >= milestone).length;
          return (
            <div key={milestone} className="flex flex-col items-center gap-1">
              <FridayBadge milestone={milestone} size={34} locked={reached === 0} />
              <span className="text-xs font-bold" aria-label={`${digits(reached)} ${t("reached")} ${digits(milestone)}`}>
                {digits(reached)}
              </span>
            </div>
          );
        })}
      </div>

      <nav aria-label={t("filterLabel")} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted p-1">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={href({ who: key })}
            aria-current={key === filter ? "page" : undefined}
            className={`flex h-9 items-center justify-center rounded-lg text-xs font-bold ${
              key === filter
                ? "bg-surface text-brand-700 shadow-sm dark:text-brand-300"
                : "text-muted-foreground"
            }`}
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="card overflow-hidden p-0">
          {rows.map((row, i) => {
            const pages = kahfCount(row.kahf_pages);
            const top = topMilestone(row.salawat);
            return (
              <li key={`${row.name}-${i}`} className="flex items-center gap-3 border-t border-border-subtle px-3 py-2.5 first:border-t-0">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i < 3 ? "bg-brand-600 text-white" : "bg-surface-muted text-muted-foreground"
                  }`}
                >
                  {digits(i + 1)}
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className="truncate text-sm font-bold">{row.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {kindLabel[row.kind]} ·{" "}
                    {pages === KAHF_PAGES
                      ? t("kahfFull")
                      : pages > 0
                        ? t("kahfSome", { count: digits(pages) })
                        : t("kahfNone")}
                  </span>
                </span>
                {top > 0 && <FridayBadge milestone={top} size={30} />}
                <span className="min-w-12 shrink-0 text-end font-display text-lg font-bold text-brand-700 dark:text-brand-300">
                  {digits(row.salawat)}
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
