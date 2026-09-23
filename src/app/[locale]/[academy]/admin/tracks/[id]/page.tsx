import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  Plus,
  ScrollText,
  TriangleAlert,
  UserPlus,
  UserRound,
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

  const unassigned = track.cohorts.filter((c) => !c.teacherName).length;
  const firstUnassignedId = track.cohorts.find((c) => !c.teacherName)?.id;

  /*
    The week every cohort shares, or null when they differ. Cohorts of one
    track normally start together, so printing the same week on each of twelve
    tiles is the repetition this screen exists to remove — it goes once above
    them instead. When they genuinely differ, each tile carries its own.
  */
  const weeks = new Set(track.cohorts.map((c) => c.currentWeek));
  const sharedWeek =
    weeks.size === 1 && track.cohorts.length > 1
      ? (track.cohorts[0].currentWeek ?? null)
      : null;

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
          <>
            {/*
              One fact said once. Twelve rows each reading "بلا معلمة" is the
              same sentence twelve times; here it is a single line she can act
              on. Gold, because the app spends gold only on what is waiting
              for her — and it disappears the moment every cohort has one.
            */}
            {unassigned > 0 && (
              <Link
                href={`/${academySlug}/admin/tracks/${track.id}/cohorts/${firstUnassignedId}/edit`}
                className="flex items-center gap-2.5 border-b border-accent-300 bg-accent-100 px-4 py-2.5 dark:border-accent-700 dark:bg-accent-700/20"
              >
                <UserPlus
                  className="h-4 w-4 shrink-0 text-accent-700 dark:text-accent-200"
                  aria-hidden="true"
                />
                <span className="flex-grow text-xs font-bold text-accent-700 dark:text-accent-200">
                  {t("needTeacher", { count: unassigned })}
                </span>
              </Link>
            )}

            {/* When every cohort sits at the same week — the normal case, since
                they start together — that week belongs here rather than on
                each of the twelve tiles. */}
            {sharedWeek !== null && (
              <p className="border-b border-border-subtle px-4 py-2 text-xs text-muted-foreground">
                {t("allAtWeek", {
                  current: sharedWeek,
                  total: track.durationWeeks,
                })}
              </p>
            )}

            {/*
              A grid, not a folded list. A cohort needs three facts — who
              teaches it, which one it is, how full it is — and three facts fit
              a tile two to a line. Twelve tiles are SHORTER than six rows plus
              a "show the rest" button, and nothing hides behind a tap. An
              inner scrollbox was the other option and is the one thing ruled
              out: on a phone it fights the page for the same drag.
            */}
            <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
              {track.cohorts.map((cohort) => (
                <li key={cohort.id}>
                  <CohortTile
                    cohort={cohort}
                    href={`/${academySlug}/admin/tracks/${track.id}/cohorts/${cohort.id}`}
                    labels={{
                      // Only when it is NOT what every other cohort says.
                      week:
                        sharedWeek === null && cohort.currentWeek
                          ? t("weekN", { n: cohort.currentWeek })
                          : sharedWeek === null
                            ? t("notStarted", {
                                date: new Intl.DateTimeFormat(
                                  locale === "ar" ? "ar-EG" : "en-GB",
                                  { day: "numeric", month: "long" },
                                ).format(
                                  new Date(`${cohort.startDate}T00:00:00Z`),
                                ),
                              })
                            : null,
                      seats: cohort.maxStudents
                        ? `${cohort.activeCount}/${cohort.maxStudents}`
                        : String(cohort.activeCount),
                      pending:
                        cohort.pendingCount > 0
                          ? String(cohort.pendingCount)
                          : null,
                      // Eleven chips reading "جارية" are the repetition this
                      // whole screen is losing; only a status that differs
                      // from the ordinary one is worth the ink.
                      status:
                        cohort.status === "running"
                          ? null
                          : t(statusKey(cohort.status)),
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
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


/**
 * One cohort, small enough that twelve of them need no folding.
 *
 * The معلمة takes the position the eye checks first, because a cohort IS its
 * معلمة — "الدفعة السابعة" is a filing number. An unassigned one is a dashed
 * ring rather than grey italic text, so down a column of twelve the missing
 * teachers read as a SHAPE rather than as a sentence repeated twelve times.
 */
function CohortTile({
  cohort,
  href,
  labels,
}: {
  cohort: TrackCohortDetail;
  href: string;
  labels: {
    /** Null when every cohort shares a week and it is stated once above. */
    week: string | null;
    seats: string;
    pending: string | null;
    /** Null while the status is the ordinary "جارية". */
    status: string | null;
  };
}) {
  const assigned = Boolean(cohort.teacherName);

  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-2 rounded-xl border border-border-subtle p-2.5 transition-colors hover:border-brand-600"
    >
      <div className="flex items-center gap-2">
        {assigned ? (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-bold text-white"
          >
            {/* Array spread, not [0]: an Arabic name can open with a surrogate
                pair, and slicing one in half prints a replacement glyph. */}
            {[...cohort.teacherName!][0]}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border-subtle text-muted-foreground"
          >
            <UserRound className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-grow truncate text-[13px] font-bold">
          {cohort.teacherName ?? cohort.name}
        </span>
      </div>

      {(assigned || labels.week || labels.status || labels.pending) && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
          {assigned && <span className="truncate">{cohort.name}</span>}
          {labels.week && <span>{labels.week}</span>}
          {labels.status && (
            <span className="rounded-full bg-surface-muted px-1.5 py-0.5 font-medium">
              {labels.status}
            </span>
          )}
          {labels.pending && (
            <span className="rounded-full bg-accent-500 px-1.5 py-0.5 font-bold text-white">
              {labels.pending}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5">
        {/* Eight pips are counted by looking; "٠ من ٨" is read. The number
            stays beside them for the screen reader and for a cohort whose
            capacity is not eight. */}
        <span className="flex flex-grow flex-wrap gap-[3px]" aria-hidden="true">
          {cohort.maxStudents !== null &&
            Array.from({ length: cohort.maxStudents }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i < cohort.activeCount ? "bg-brand-500" : "bg-surface-muted"
                }`}
              />
            ))}
        </span>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            cohort.maxStudents !== null &&
            cohort.activeCount >= cohort.maxStudents
              ? "font-bold text-brand-700 dark:text-brand-300"
              : "text-muted-foreground"
          }`}
        >
          {labels.seats}
        </span>
      </div>
    </Link>
  );
}
