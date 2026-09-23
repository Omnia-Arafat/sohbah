import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Route, TriangleAlert, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { WeekTicks } from "@/components/week-ticks";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { listTracks, type TrackRow } from "@/lib/tracks-list-dal";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tracks" });
  return { title: t("title") };
}

export default async function TracksPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("tracks");
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

  /*
    Accepting, removing or rejecting a student is a مشرفة's decision — the
    database says so too (approve_track_enrollment checks can_supervise, and
    the write policy on track_enrollments is supervisor-only). This check is
    the door; the policies are the lock.
  */
  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("adminOnly")}</p>
      </div>
    );
  }

  const tracks = await listTracks(academy.id);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("subtitle", { weeks: 40 })}
          </p>
        </div>
      </section>

      {tracks === null ? (
        <SetupPending
          title={t("notReady")}
          note={t("notReadyNote")}
          file={t("notReadyFile")}
        />
      ) : tracks.length === 0 ? (
        <section className="card">
          <Route
            className="h-6 w-6 text-brand-600 dark:text-brand-300"
            aria-hidden="true"
          />
          <p className="mt-2 font-semibold">{t("empty")}</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t("emptyNote")}
          </p>
        </section>
      ) : (
        <>
          <Totals tracks={tracks} enrolledLabel={t("enrolled")} note={t("enrolledNote")} />
          <ul className="flex flex-col gap-3">
            {tracks.map((track, i) => (
              <li key={track.id}>
                <TrackCard
                  track={track}
                  index={i}
                  academySlug={academySlug}
                  inactiveLabel={t("draft")}
                  locale={locale}
                  weeksLabel={t("weeksOf", {
                    published: track.publishedWeeks,
                    total: track.durationWeeks,
                  })}
                  cohortsLabel={t("cohortCount", {
                    count: track.cohorts.length,
                  })}
                  seatsLabel={seatsAcross(track, t)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The one thing worth counting across all six: how many students a track reaches. */
async function Totals({
  tracks,
  enrolledLabel,
  note,
}: {
  tracks: TrackRow[];
  enrolledLabel: string;
  note: string;
}) {
  const enrolled = tracks.reduce(
    (sum, track) =>
      sum + track.cohorts.reduce((n, cohort) => n + cohort.activeCount, 0),
    0,
  );
  const pending = tracks.reduce(
    (sum, track) =>
      sum + track.cohorts.reduce((n, cohort) => n + cohort.pendingCount, 0),
    0,
  );

  if (enrolled === 0 && pending === 0) return null;

  return (
    <section className="card">
      <div className="flex items-baseline gap-2">
        <Users
          className="h-[18px] w-[18px] self-center text-brand-600 dark:text-brand-300"
          aria-hidden="true"
        />
        <p className="text-2xl font-bold">{enrolled}</p>
        <p className="text-sm text-muted-foreground">{enrolledLabel}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </section>
  );
}

/**
 * Seats across all of a track's cohorts.
 *
 * A track with no capacity set anywhere reads "بلا حدّ" rather than a total
 * of zero, which would look like a full track with nowhere to put anyone.
 */
function seatsAcross(track: TrackRow, t: (k: string, v?: Record<string, number>) => string) {
  const taken = track.cohorts.reduce((n, c) => n + c.activeCount, 0);
  const capacity = track.cohorts.reduce((n, c) => n + (c.maxStudents ?? 0), 0);
  return capacity === 0 ? t("noSeatCap") : t("seatsOf", { taken, capacity });
}

function TrackCard({
  track,
  index,
  academySlug,
  inactiveLabel,
  locale,
  weeksLabel,
  cohortsLabel,
  seatsLabel,
}: {
  track: TrackRow;
  index: number;
  academySlug: string;
  inactiveLabel: string;
  locale: string;
  weeksLabel: string;
  cohortsLabel: string;
  seatsLabel: string;
}) {
  const pending = track.cohorts.reduce((n, c) => n + c.pendingCount, 0);

  return (
    <Link
      href={`/${academySlug}/admin/tracks/${track.id}`}
      className="card block transition-colors hover:border-brand-600"
    >
      <div className="flex items-start gap-3.5">
        {/*
          The number, not an icon. Six tracks differ by which number they
          are — the same Route glyph repeated six times distinguishes
          nothing, and reading it six times costs more than reading ١…٦.
        */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-display text-xl font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
          {new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(index + 1)}
        </span>

        <div className="min-w-0 flex-grow">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="font-semibold">{track.name}</h2>
            {/* The range belongs beside the name, not on a line of its own:
                it is what tells two tracks apart. */}
            {track.scope && (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {track.scope}
              </span>
            )}
            {pending > 0 && (
              <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {pending}
              </span>
            )}
            {!track.isActive && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {inactiveLabel}
              </span>
            )}
          </div>

          <div className="mt-2.5">
            <WeekTicks total={track.durationWeeks} filled={track.publishedWeeks} />
          </div>

          {/*
            Counted, not listed. Twelve chips reading "الدفعة الخامسة ٠/٨"
            said nothing twelve times and made one card taller than the
            screen — and a list of six tracks is for choosing which one to
            open, so the only cohort facts that belong here are how many
            there are and whether the seats are filling. The names are one
            tap away, on the track itself.
          */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span>{weeksLabel}</span>
            {track.cohorts.length > 0 && (
              <>
                <span>{cohortsLabel}</span>
                <span className="tabular-nums">{seatsLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Shown when the tables are not there yet. Deliberately specific: a مشرفة
 * cannot fix this, but whoever she forwards it to can act on it immediately.
 */
function SetupPending({
  title,
  note,
  file,
}: {
  title: string;
  note: string;
  file: string;
}) {
  return (
    <section className="card border-accent-300 dark:border-accent-700">
      <div className="flex items-start gap-3">
        <TriangleAlert
          className="h-5 w-5 shrink-0 text-accent-600 dark:text-accent-300"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{note}</p>
          {/* A file path is Latin text: left it to the RTL container and the
              digits in the timestamp split across the wrap. */}
          <p
            dir="ltr"
            className="mt-2 break-all rounded-lg bg-surface-muted px-3 py-2 text-start font-mono text-xs text-muted-foreground"
          >
            {file}
          </p>
        </div>
      </div>
    </section>
  );
}
