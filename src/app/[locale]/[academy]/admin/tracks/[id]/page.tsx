import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  ChevronDown,
  Plus,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { WeekTicks } from "@/components/week-ticks";
import { WeekBand } from "./week-band";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import {
  getTrackDetail,
  type TrackCohortDetail,

} from "@/lib/track-detail-dal";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

/** Cohorts shown before the rest fold away. Roughly a phone screen of them. */
const VISIBLE_COHORTS = 6;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tracks" });
  return { title: t("title") };
}

export default async function TrackPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("track");
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

  // Same door as the list: the policies behind it are the lock.
  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tTracks("adminOnly")}</p>
      </div>
    );
  }

  const track = await getTrackDetail(academy.id, id);

  if (track === "missing-schema") {
    return (
      <section className="card border-accent-300 dark:border-accent-700">
        <div className="flex items-start gap-3">
          <TriangleAlert
            className="h-5 w-5 shrink-0 text-accent-600 dark:text-accent-300"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-semibold">{tTracks("notReady")}</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {tTracks("notReadyNote")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // A track of another academy reads as absent rather than forbidden: the id
  // is not this academy's to know about.
  if (!track) notFound();

  const publishedWeeks = track.weeks.filter((w) => w.isPublished).length;

  /*
    The week the band opens on: the furthest any cohort has reached. When two
    cohorts sit at different weeks the far one is the urgent one — it is the
    week whose schedule is needed next, and the week behind it is already
    written.
  */
  const focusWeek =
    track.cohorts.reduce<number | null>(
      (far, c) => (c.currentWeek && c.currentWeek > (far ?? 0) ? c.currentWeek : far),
      null,
    ) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/${academySlug}/admin/tracks`}>{t("back")}</BackLink>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {track.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {[track.scope, track.dailyLoad].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 sm:w-64">
          <WeekTicks total={track.durationWeeks} filled={publishedWeeks} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {tTracks("weeksOf", {
              published: publishedWeeks,
              total: track.durationWeeks,
            })}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Cohorts first. A track is a definition; a cohort is the thing
          with students in it, and it is what the reader came to act on.
      --------------------------------------------------------------- */}
      <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
          <h2 className="flex-grow text-sm font-bold text-foreground/80">
            {t("cohorts")}
          </h2>
          <Link
            href={`/${academySlug}/admin/tracks/${track.id}/cohorts/new`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
            {t("newCohort")}
          </Link>
        </div>

        {track.cohorts.length === 0 ? (
          <div className="px-4 py-4">
            <p className="text-sm font-semibold">{t("cohortsNone")}</p>
            <p className="mt-1 max-w-prose text-xs text-muted-foreground">
              {t("cohortsNoneNote")}
            </p>
          </div>
        ) : (
          (() => {
            const rows = track.cohorts.map((cohort) => (
              <li
                key={cohort.id}
                className="border-t border-border-subtle first:border-t-0"
              >
                <CohortRow
                  cohort={cohort}
                  durationWeeks={track.durationWeeks}
                  href={`/${academySlug}/admin/tracks/${track.id}/cohorts/${cohort.id}`}
                  locale={locale}
                  labels={{
                    week: t("weekOf", {
                      current: cohort.currentWeek ?? 0,
                      total: track.durationWeeks,
                    }),
                    notStarted: t("notStarted", {
                      date: new Intl.DateTimeFormat(
                        locale === "ar" ? "ar-EG" : "en-GB",
                        { day: "numeric", month: "long" },
                      ).format(new Date(`${cohort.startDate}T00:00:00Z`)),
                    }),
                    seats: cohort.maxStudents
                      ? t("seats", {
                          taken: cohort.activeCount,
                          capacity: cohort.maxStudents,
                        })
                      : t("seatsOpen"),
                    pending:
                      cohort.pendingCount > 0
                        ? t("pending", { count: cohort.pendingCount })
                        : null,
                    noTeacher: t("noTeacher"),
                    status: t(statusKey(cohort.status)),
                  }}
                />
              </li>
            ));

            /*
              Twelve معلمات on one track is normal here, and twelve rows is
              more scroll than the schedule below it. Show a screenful; the
              rest open on demand. <details> rather than state because this
              page is otherwise a server component and a disclosure triangle
              is the one interaction the platform already does.
            */
            if (rows.length <= VISIBLE_COHORTS) return <ul>{rows}</ul>;

            return (
              <>
                <ul>{rows.slice(0, VISIBLE_COHORTS)}</ul>
                <details className="group border-t border-border-subtle">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 px-4 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    <ChevronDown
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                    {t("moreCohorts", { count: rows.length - VISIBLE_COHORTS })}
                  </summary>
                  <ul className="border-t border-border-subtle">
                    {rows.slice(VISIBLE_COHORTS)}
                  </ul>
                </details>
              </>
            );
          })()
        )}
      </section>

      {/* ---------------------------------------------------------------
          The forty weeks. Entered once here, read by every cohort — that
          is the whole reason a track and a cohort are separate tables.
      --------------------------------------------------------------- */}
      <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
          <CalendarDays
            className="h-4 w-4 shrink-0 text-foreground/70"
            aria-hidden="true"
          />
          <h2 className="flex-grow text-sm font-bold text-foreground/80">
            {t("schedule")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {tTracks("weeksOf", {
              published: publishedWeeks,
              total: track.durationWeeks,
            })}
          </span>
        </div>

        <p className="border-b border-border-subtle px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t("scheduleNote")}
        </p>

        <WeekBand
          weeks={track.weeks}
          academySlug={academySlug}
          trackId={track.id}
          currentWeek={focusWeek}
        />
      </section>

      {/* The rules screen is seeded in the database and editable there, but
          has no page yet — described, not linked, for the same reason the
          week cells are not links. */}
      <div className="card flex items-start gap-3">
        <ScrollText
          className="h-5 w-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("rules")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("rulesNote")}</p>
        </div>
      </div>
    </div>
  );
}

function statusKey(status: string) {
  switch (status) {
    case "registering":
      return "statusRegistering" as const;
    case "running":
      return "statusRunning" as const;
    case "paused":
      return "statusPaused" as const;
    case "finished":
      return "statusFinished" as const;
    default:
      return "statusDraft" as const;
  }
}

function CohortRow({
  cohort,
  durationWeeks,
  href,
  labels,
}: {
  cohort: TrackCohortDetail;
  durationWeeks: number;
  href: string;
  locale: string;
  labels: {
    week: string;
    notStarted: string;
    seats: string;
    pending: string | null;
    noTeacher: string;
    status: string;
  };
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2.5 px-4 py-3 transition-colors hover:bg-surface-muted"
    >
      {/*
        Two justified lines, not one wrapping pile. Twelve of these sit under
        each other, so the eye should be able to run straight down a column:
        names down one edge, status and seats down the other. The loose
        arrangement wrapped differently on every row depending on how long the
        معلمة's name was, which is what made the list read as unsorted.
      */}
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-grow truncate text-sm font-bold">
          {cohort.name}
        </h3>
        {labels.pending && (
          <span className="shrink-0 rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {labels.pending}
          </span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            cohort.status === "running"
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-100"
              : cohort.status === "registering"
                ? "bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-200"
                : "bg-surface-muted text-muted-foreground"
          }`}
        >
          {labels.status}
        </span>
      </div>

      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span
          className={`min-w-0 flex-grow truncate ${
            cohort.teacherName ? "" : "italic"
          }`}
        >
          {cohort.teacherName ?? labels.noTeacher}
        </span>
        <span className="shrink-0 tabular-nums">
          {cohort.currentWeek ? labels.week : labels.notStarted}
        </span>
        <span className="shrink-0 tabular-nums">{labels.seats}</span>
      </div>

      <WeekTicks
        total={durationWeeks}
        filled={0}
        currentWeek={cohort.currentWeek}
        height={8}
      />
    </Link>
  );
}
