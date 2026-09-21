import type { Metadata } from "next";
import { Route, TriangleAlert } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "../login/login-form";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getAcademyAdminRole, getTeacherDisplayLabel } from "@/lib/academy-display";
import { getTracksOverview } from "@/lib/tracks-dal";
import { listTracks } from "@/lib/tracks-list-dal";
import { WeekTicks } from "@/components/week-ticks";
import { formatTime } from "@/lib/format-time";
import { notFound } from "next/navigation";

type AdminPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: AdminPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations("admin");
  const adminRole = getAcademyAdminRole(academySlug, locale);

  /*
    The admin entrance signs you in where you stand rather than bouncing you to
    the teachers' sign-in page and back. `/admin` is the address you give
    someone who administers the academy, so it has to work as a landing page for
    a signed-out visitor — not just as a guarded destination.

    This is presentation only. It is the same `signIn` action and the same
    Supabase session; every admin screen still checks the role for itself.
  */
  const session = await getTeacherSession();

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <section>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("signIn.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("signIn.subtitle")}</p>
        </section>

        {!isSupabaseConfigured() && <SetupNotice />}

        <LoginForm academySlug={academySlug} next={`/${academySlug}/admin`} />

        <p className="text-center text-sm text-muted-foreground">
          {t("signIn.teachersNote")}{" "}
          <Link
            href={`/${academySlug}/login`}
            className="font-medium text-brand-700 underline dark:text-brand-300"
          >
            {t("signIn.teachersLink")}
          </Link>
        </p>
      </div>
    );
  }

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  const supabase = await createClient();

  /*
    THE SHAPE OF THIS PAGE, AND WHY IT CHANGED

    It used to be three counts over a grid of eight identical cards, each a
    door to a list. Nothing on it said what was happening in the academy right
    now, and every feature added a ninth, tenth, eleventh card — so the page
    got slower to read the more the app could do.

    Now it answers, in order: what needs a decision from me, what is happening
    at this moment, and what is on today — and then it stops. The destinations
    it used to list are all in the rail and in the phone's "المزيد" sheet, so
    listing them here too was only ever a second copy of the navigation.
  */
  const [
    circlesResult,
    studentsResult,
    teachersResult,
    pendingResult,
    todayResult,
    liveResult,
    tracks,
    trackList,
  ] = await Promise.all([
    supabase
      .from("circles")
      .select("*", { count: "exact", head: true })
      .eq("academy_id", academy.id)
      .eq("is_active", true),
    supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("academy_id", academy.id),
    supabase
      .from("teachers")
      .select("*", { count: "exact", head: true })
      .eq("academy_id", academy.id)
      .eq("is_active", true),
    // Applications waiting for approval, surfaced in the attention strip.
    supabase
      .from("teachers")
      .select("*", { count: "exact", head: true })
      .eq("academy_id", academy.id)
      .eq("is_active", false),
    supabase.rpc("teacher_today_circles"),
    supabase.rpc("academy_live_circles", { p_academy_id: academy.id }),
    // Both null when the tracks migration has not been applied yet — see
    // src/lib/tracks-dal.ts. The rest of this page does not depend on them.
    getTracksOverview(academy.id),
    listTracks(academy.id),
  ]);

  if (todayResult.error)
    console.error("teacher_today_circles failed", todayResult.error);
  if (liveResult.error)
    console.error("academy_live_circles failed", liveResult.error);

  const circlesCount = circlesResult.count ?? 0;
  const studentsCount = studentsResult.count ?? 0;
  const teachersCount = teachersResult.count ?? 0;
  const pendingTeachersCount = pendingResult.count ?? 0;

  const todayCircles = todayResult.data ?? [];
  const liveCircles = liveResult.data ?? [];
  const liveIds = new Set(liveCircles.map((c) => c.circle_id));
  const queuedNow = liveCircles.reduce(
    (sum, c) => sum + Number(c.waiting_count ?? 0),
    0,
  );

  /*
    "Rest of the day" means exactly that.

    The old list printed all of today's circles, so by evening most of it was
    circles that had already finished — rows you scroll past to reach the one
    that matters. A day should shrink as it passes, not stay the same length.

    Each circle keeps its own timezone, so "has it started" is asked in that
    circle's clock rather than the server's.
  */
  function hasStarted(startTime: string, timezone: string) {
    const nowLocal = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    return startTime.slice(0, 5) <= nowLocal;
  }

  const upcoming = todayCircles.filter(
    (c) => !liveIds.has(c.id) && !hasStarted(c.start_time, c.timezone),
  );
  const displayName = getTeacherDisplayLabel(session.teacher, academySlug, locale);
  const todayLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const trackAlerts = tracks?.openAlerts ?? [];
  const attentionCount = trackAlerts.length + (pendingTeachersCount > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {adminRole ?? displayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </section>

      {/* ---------------------------------------------------------------
          Needs your attention.

          First on the page because it is the only part of it that asks
          something of the reader. A warning computed in the dark helps
          nobody: each row names the student and carries the action.
      --------------------------------------------------------------- */}
      {/* No "nothing needs you" card. A panel that exists to report its own
          emptiness still costs a heading, a border and a scroll — and on a
          good day it is the first thing on the page, which teaches the eye to
          skip exactly where the warnings will appear. Absent means fine. */}
      {attentionCount > 0 && (
        <section
          aria-label={t("home.attention")}
          className="overflow-hidden rounded-2xl border border-absent/30 bg-surface"
        >
          <div className="flex items-center gap-2.5 border-b border-absent/30 bg-absent/5 px-4 py-2.5">
            <TriangleAlert
              className="h-[18px] w-[18px] shrink-0 text-absent"
              aria-hidden="true"
            />
            <h2 className="min-w-0 flex-grow text-sm font-bold text-absent">
              {t("home.attention")} — {t("home.attentionCount", { count: attentionCount })}
            </h2>
          </div>

          <ul>
            {trackAlerts.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-grow">
                  <p className="truncate text-sm font-semibold">{alert.title}</p>
                  {alert.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {alert.detail}
                    </p>
                  )}
                </div>
                <Link
                  href={`/${academySlug}/admin/tracks`}
                  className="btn-secondary shrink-0 px-4 py-2 text-xs max-sm:w-full"
                >
                  {t("home.review")}
                </Link>
              </li>
            ))}

            {pendingTeachersCount > 0 && (
              <li className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-grow">
                  <p className="truncate text-sm font-semibold">
                    {t("home.pendingTeachers")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("home.pendingTeachersNote", { count: pendingTeachersCount })}
                  </p>
                </div>
                <Link
                  href={`/${academySlug}/admin/teachers`}
                  className="btn-secondary shrink-0 px-4 py-2 text-xs max-sm:w-full"
                >
                  {t("home.review")}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------
          TIER A — the one filled panel on the page.

          What is happening this minute, in brand-900 with gold for the
          pulse. Exactly one of these may exist: a second would cancel the
          first, and the whole point is that the eye lands here before it
          lands anywhere else.

          When nothing is running there is no panel at all. It used to step
          down to a quiet card saying so, with the next circle's time under
          it — which is most of the day, so most of the day the loudest slot
          on the page held a sentence about nothing happening. What is coming
          is the schedule's job, and الجدول is a tab away.
      --------------------------------------------------------------- */}
      {liveCircles.length > 0 && (
        <section
          aria-label={t("home.nowRunning")}
          className="rounded-2xl bg-brand-900 px-5 py-5 text-brand-100 sm:px-6"
        >
          <p className="flex items-center gap-2 text-xs text-brand-200">
            <span
              aria-hidden="true"
              className="h-[7px] w-[7px] rounded-full bg-accent-500"
            />
            {t("home.nowRunning")}
          </p>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display text-4xl font-bold leading-none text-white">
              {liveCircles.length}
            </span>
            <span className="text-base font-semibold text-white">
              {t("home.nowCircles", { count: liveCircles.length })}
            </span>
            {/* A separator element, not a conjunction inside the string: a
                message starting with "و" lands next to a Latin numeral and
                bidi reorders it to "8و". */}
            <span aria-hidden="true" className="text-sm text-brand-300">
              ·
            </span>
            <span className="text-sm text-brand-200">
              {t("home.nowQueued", { count: queuedNow })}
            </span>
          </p>

          <ul className="mt-3.5 flex flex-col gap-2">
            {liveCircles.slice(0, 3).map((circle) => (
              <li
                key={circle.circle_id}
                className="flex flex-col gap-2.5 rounded-xl bg-brand-950 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 flex-grow">
                  <span className="block truncate text-sm font-bold text-white">
                    {circle.circle_name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-brand-200">
                    {circle.reciting_name
                      ? t("home.nowReciting", { name: circle.reciting_name })
                      : t("home.inQueue", {
                          count: Number(circle.waiting_count ?? 0),
                        })}
                  </span>
                </span>
                <Link
                  href={`/${academySlug}/circle/${circle.registration_slug}`}
                  className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-center text-xs font-bold text-white"
                >
                  {t("home.openQueue")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------
          TIER C — three short numbers are one instrument, not three
          boxes. Dividers instead of borders; nothing here is clickable,
          so nothing here looks clickable.
      --------------------------------------------------------------- */}
      <section className="flex overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">{studentsCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("home.students")}
          </p>
        </div>
        <div aria-hidden="true" className="w-px bg-border-subtle" />
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">{circlesCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("home.circles")}
          </p>
        </div>
        <div aria-hidden="true" className="w-px bg-border-subtle" />
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">{teachersCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("home.teachers")}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------------
            TIER B — a panel with a header band. The band is what makes
            the rows read as one block instead of a heading floating over
            a stack of cards.
        ------------------------------------------------------------ */}
        {upcoming.length > 0 && (
        <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
            <h2 className="flex-grow text-sm font-bold text-foreground/80">
              {t("home.restOfDay")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("home.restCount", { count: upcoming.length })}
            </span>
            <Link
              href={`/${academySlug}/admin/circles`}
              className="text-xs font-semibold text-brand-700 dark:text-brand-300"
            >
              {t("home.allCircles")}
            </Link>
          </div>

            <ul>
              {upcoming.slice(0, 6).map((circle) => (
                <li
                  key={circle.id}
                  className="border-t border-border-subtle first:border-t-0"
                >
                  <Link
                    href={`/${academySlug}/circle/${circle.registration_slug}`}
                    className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span className="w-14 shrink-0 text-sm font-bold">
                      {formatTime(circle.start_time, locale)}
                    </span>
                    <span className="min-w-0 flex-grow truncate text-sm">
                      {circle.name}
                    </span>
                    {Number(circle.joined_count ?? 0) > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("home.inQueue", {
                          count: Number(circle.joined_count ?? 0),
                        })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

          <p className="mt-auto border-t border-border-subtle px-4 py-2.5 text-[11px] text-muted-foreground">
            {t("home.passedNote")}
          </p>
        </section>
        )}

        {/* ------------------------------------------------------------
            المسارات. Each track is forty cells, one per week — see
            src/components/week-ticks.tsx for why that beats a bar.
        ------------------------------------------------------------ */}
        {/* Hidden outright when there are no tracks. `null` is not the same as
            empty, though: it means the tables are not installed yet, which is
            something the مشرفة has to act on rather than something absent. */}
        {(trackList === null || trackList.length > 0) && (
        <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
            <Route
              className="h-4 w-4 shrink-0 text-foreground/70"
              aria-hidden="true"
            />
            <h2 className="flex-grow text-sm font-bold text-foreground/80">
              {t("home.tracksPanel")}
            </h2>
            <Link
              href={`/${academySlug}/admin/tracks`}
              className="text-xs font-semibold text-brand-700 dark:text-brand-300"
            >
              {t("home.manage")}
            </Link>
          </div>

          {trackList === null ? (
            <div className="px-4 py-4">
              <p className="text-sm font-semibold">{t("tracksCard.notReady")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("tracksCard.notReadyNote")}
              </p>
            </div>
          ) : (
            <ul>
              {trackList.map((track, i) => (
                <li
                  key={track.id}
                  className="flex items-center gap-2.5 border-t border-border-subtle px-4 py-2.5 first:border-t-0"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[13px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
                    {new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(
                      i + 1,
                    )}
                  </span>
                  <span className="min-w-0 flex-grow">
                    <WeekTicks
                      total={track.durationWeeks}
                      filled={track.publishedWeeks}
                      height={13}
                    />
                  </span>
                  <span className="w-11 shrink-0 text-[11px] text-muted-foreground">
                    {track.publishedWeeks}/{track.durationWeeks}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {trackList !== null && trackList.length > 0 && (
            <div className="mt-auto border-t border-border-subtle px-4 py-3.5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("home.schedulesNote")}
              </p>
              <Link
                href={`/${academySlug}/admin/tracks`}
                className="mt-2.5 inline-flex min-h-11 items-center rounded-xl bg-brand-50 px-4 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-100"
              >
                {t("home.startCohort")}
              </Link>
            </div>
          )}
        </section>
        )}
      </div>

      {/* ---------------------------------------------------------------
          THERE IS NO LIST OF SECTIONS HERE, ON PURPOSE.

          /admin was a wall of eight identical cards because, when it was
          written, there was no navigation — the page had to be the
          directory. There is one now: the rail carries every section on a
          desktop, and the bottom bar's "المزيد" sheet carries the same set
          on a phone. Repeating them down the page is not a compact
          directory, it is a second copy of the navigation that is already
          on screen — eleven identical rows with eleven identical chevrons,
          most of a phone screen, telling the reader nothing.

          So this page answers three questions and stops: what needs a
          decision from me, what is happening right now, what is on today.
          Anything that is merely a destination belongs in the rail.
      --------------------------------------------------------------- */}
    </div>
  );
}
