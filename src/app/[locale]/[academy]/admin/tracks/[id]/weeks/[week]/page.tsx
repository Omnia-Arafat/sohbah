import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import {
  getTrackWeek,
  getPreviousWeekEnd,
  cohortsOnWeek,
} from "@/lib/track-week-dal";
import { WeekForm } from "./week-form";

type PageProps = {
  params: Promise<{
    locale: string;
    academy: string;
    id: string;
    week: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, week } = await params;
  const t = await getTranslations({ locale, namespace: "weekEdit" });
  return { title: t("title", { n: week }) };
}

export default async function WeekPage({ params }: PageProps) {
  const { locale, academy: academySlug, id, week } = await params;
  setRequestLocale(locale);

  const weekNumber = Number(week);
  if (!Number.isInteger(weekNumber) || weekNumber < 1) notFound();

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("weekEdit");
  const tTracks = await getTranslations("tracks");
  const tAdmin = await getTranslations("admin");
  const session = await getTeacherSession();

  if (!session || !isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session?.teacher ? "inactive" : "notLinked"}
        email={session?.email ?? null}
      />
    );
  }

  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tTracks("adminOnly")}</p>
      </div>
    );
  }

  const [weekData, continueFrom] = await Promise.all([
    getTrackWeek(academy.id, id, weekNumber),
    getPreviousWeekEnd(id, weekNumber),
  ]);

  if (weekData === "missing-schema" || !weekData) notFound();

  /*
    Who this week reaches. Not a setting — a consequence of where each cohort
    has got to, which moves on its own every week. The question "which
    cohorts does this apply to" has an answer already, so the screen states
    it rather than asking.
  */
  const readers = await cohortsOnWeek(id, weekNumber, weekData.durationWeeks);

  const prev = weekNumber > 1 ? weekNumber - 1 : null;
  const next = weekNumber < weekData.durationWeeks ? weekNumber + 1 : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <BackLink href={`/${academySlug}/admin/tracks/${id}`}>{t("back")}</BackLink>

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("title", { n: weekNumber })}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("subtitle", { total: weekData.durationWeeks })}
          </p>
        </div>

        {/* Forty weeks is a lot of back-and-forth; stepping between them
            without returning to the grid is most of the work. */}
        <div className="flex shrink-0 gap-2">
          <WeekStep
            href={
              prev ? `/${academySlug}/admin/tracks/${id}/weeks/${prev}` : null
            }
            label={t("prevWeek")}
            direction="prev"
          />
          <WeekStep
            href={
              next ? `/${academySlug}/admin/tracks/${id}/weeks/${next}` : null
            }
            label={t("nextWeek")}
            direction="next"
          />
        </div>
      </section>

      {/*
        Who this week is for. Written once and read by whoever reaches it —
        so the answer is never "pick some cohorts", it is "these, today, and
        every cohort that gets here later".

        The empty case is the one that needed saying out loud: filling week
        30 while everyone is on week 25 looks like writing into a void, and
        without this line it is easy to think the work went nowhere.
      */}
      {readers.length > 0 ? (
        <section className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-700 dark:bg-brand-900/40">
          <p className="text-xs font-bold text-brand-800 dark:text-brand-100">
            {t("readThisWeek", { count: readers.length })}
          </p>
          <p className="mt-1 text-xs text-brand-800/80 dark:text-brand-100/80">
            {readers
              .map((c) => c.teacherName ?? c.name)
              .join(locale === "ar" ? "، " : ", ")}
          </p>
        </section>
      ) : (
        <p className="rounded-2xl border border-border-subtle px-4 py-3 text-xs text-muted-foreground">
          {t("readNoneYet")}
        </p>
      )}

      <WeekForm
        academySlug={academySlug}
        trackId={id}
        weekId={weekData.id}
        weekNumber={weekNumber}
        title={weekData.title}
        isPublished={weekData.isPublished}
        days={weekData.days}
        continueFrom={continueFrom}
      />
    </div>
  );
}

/** Disabled as a span rather than a dead link at either end of the forty. */
function WeekStep({
  href,
  label,
  direction,
}: {
  href: string | null;
  label: string;
  direction: "prev" | "next";
}) {
  // In an RTL page the previous week sits to the right, so the arrow that
  // means "back" is the one that points that way.
  const Icon = direction === "prev" ? ChevronRight : ChevronLeft;

  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs text-muted-foreground opacity-50"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs font-semibold transition-colors hover:border-brand-600"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
