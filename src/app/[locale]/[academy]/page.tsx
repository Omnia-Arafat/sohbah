import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Users } from "lucide-react";
import { formatTime } from "@/lib/format-time";
import {
  loadBoardsWithCircles,
  loadScheduleBoards,
  type ScheduleEntry,
} from "@/lib/schedule-boards";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand-mark";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getLocalizedAcademyName } from "@/lib/academy-display";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import type { LiveCircle } from "@/lib/database.types";
import { notFound } from "next/navigation";
import Image from "next/image";

type AcademyHomeProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Circles move, and this page leads with what is running — never cache it. */
export const dynamic = "force-dynamic";

/**
 * The front door.
 *
 * WHO IT IS FOR: people who never sign in. There are twenty-nine معلمات and
 * hundreds of students, and the page used to answer all of them with two
 * equally weighted sign-in cards. It now answers the question a student
 * actually opens it to ask, in the order she asks it:
 *
 *   1. Is a circle running right now, and whose turn is it?
 *   2. What else is on today?
 *   3. Where is my own record?
 *
 * and only then, in one quiet line, the door for staff — who know where it is,
 * open it daily, and do not need it competing with the live circles.
 *
 * The gold is the whole argument for the top section: the token file says it
 * is reserved for "happening now" and that its scarcity is what makes it read
 * that way. This is the one screen where several things could claim it, and
 * only the running circles get it.
 */
export default async function AcademyHome({ params }: AcademyHomeProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("home");
  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);

  const supabase = await createClient();

  /*
    Today's circles come through the same published boards the public timetable
    uses, so this page and that one can never disagree about what is on.

    The LIVE ones come from `academy_live_circles` instead, which is the only
    thing that knows the clock in each circle's own timezone and the state of
    its queue. The two are joined by circle id below.
  */
  const [boards, liveResult, circleTypes] = await Promise.all([
    loadScheduleBoards(supabase, academy.id),
    supabase.rpc("academy_live_circles", { p_academy_id: academy.id }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);
  const loadedBoards = await loadBoardsWithCircles(supabase, academy.id, boards);

  if (liveResult.error) {
    console.error("academy_live_circles failed", liveResult.error);
  }
  const live = (liveResult.data ?? []) as LiveCircle[];
  const liveIds = new Set(live.map((circle) => circle.circle_id));

  // A circle can sit on more than one board (a type board and a section board),
  // so collapse by circle id rather than showing it twice.
  //
  // The board is also where the circle's TYPE comes from: `ScheduleEntry`
  // carries the circle's name, and in this academy a circle is named after its
  // معلمة — so a row would read "فاطمة عبدالله / فاطمة عبدالله". The useful
  // second line is what kind of circle it is.
  const todayById = new Map<string, ScheduleEntry>();
  const typeByCircle = new Map<string, string>();
  for (const loaded of loadedBoards) {
    const todayRow = loaded.days.find((day) => day.day === loaded.todayIndex);
    for (const entry of todayRow?.entries ?? []) {
      todayById.set(entry.circleId, entry);
      typeByCircle.set(entry.circleId, loaded.board.circle_type);
    }
  }

  // The rest of today: everything scheduled that is not on screen above.
  const rest = [...todayById.values()]
    .filter((entry) => !liveIds.has(entry.circleId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex flex-col gap-5">
      {/* Smaller than it was. The name of the academy is not what anyone came
          for, and at 80px of logo plus a 4xl heading it was pushing the
          circles below the fold on a phone. */}
      <section className="flex flex-col items-center text-center">
        {academy.logo_path ? (
          <div className="relative h-14 w-14">
            <Image
              src={academy.logo_path}
              alt={academyName}
              fill
              sizes="56px"
              className="object-contain"
            />
          </div>
        ) : (
          <BrandMark className="h-14 w-14" />
        )}
        <h1 className="font-display mt-2 text-2xl font-bold">{academyName}</h1>
      </section>

      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-accent-700 dark:text-accent-300">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full bg-accent-500"
            />
            {t("live.label", { count: live.length })}
          </h2>

          {live.map((circle) => (
            <LiveCircleCard
              key={circle.circle_id}
              circle={circle}
              academySlug={academySlug}
              locale={locale}
              typeLabel={circleTypeLabel(circleTypes, circle.circle_type, locale)}
              t={t}
            />
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <section className="card p-0">
          <div className="flex items-baseline justify-between gap-3 px-5 pb-1 pt-4">
            <h2 className="text-sm font-bold text-muted-foreground">
              {live.length > 0 ? t("rest.title") : t("today.title")}
            </h2>
            <Link
              href={`/${academySlug}/schedule`}
              className="text-xs font-semibold text-brand-700 dark:text-brand-300"
            >
              {t("today.fullWeek")}
            </Link>
          </div>

          <ul>
            {rest.map((entry) => (
              <li key={entry.circleId} className="border-t border-border-subtle">
                <Link
                  href={`/${academySlug}/circle/${entry.registrationSlug}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
                >
                  <span className="w-16 shrink-0 text-sm font-bold text-muted-foreground">
                    {formatTime(entry.startTime, locale)}
                  </span>
                  <span className="min-w-0 flex-grow">
                    <span className="block truncate font-medium">
                      {entry.teacherName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {circleTypeLabel(
                        circleTypes,
                        typeByCircle.get(entry.circleId) ?? "",
                        locale,
                      )}
                    </span>
                  </span>
                  {/* Points the way the row goes: left in Arabic, right in
                      English. `ChevronLeft` is already correct for RTL, so it
                      is the LTR case that needs flipping. */}
                  <ChevronLeft
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground ltr:rotate-180"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length === 0 && rest.length === 0 && (
        <section className="card">
          <h2 className="font-display text-lg font-bold">{t("today.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("today.none")}</p>
          <Link
            href={`/${academySlug}/schedule`}
            className="btn-secondary mt-4 w-full"
          >
            {t("today.fullWeek")}
          </Link>
        </section>
      )}

      {/* Her own record. New, and the reason a student comes back on a day
          with no circle. */}
      <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <h2 className="font-display text-lg font-bold">{t("me.title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("me.body")}
        </p>
        <Link href={`/${academySlug}/me`} className="btn-primary mt-3 w-full">
          {t("me.cta")}
        </Link>
      </section>

      <section className="card">
        <div className="flex items-start gap-3">
          <Users
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-grow">
            <h2 className="text-base font-semibold">{t("doors.students.title")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("doors.students.body")}
            </p>
            <Link
              href={`/${academySlug}/register`}
              className="btn-secondary mt-3 w-full"
            >
              {t("doors.students.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/*
        Staff, in one line rather than a card of equal weight.

        Not a demotion of the معلمات — the opposite. They open this app every
        day and know exactly where the door is; a student opens it once a week
        and does not. Weight belongs where the uncertainty is.
      */}
      <section className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-sm">
        <span className="text-muted-foreground">{t("staff.line")}</span>
        <Link
          href={`/${academySlug}/login`}
          className="font-semibold text-brand-700 dark:text-brand-300"
        >
          {t("staff.login")}
        </Link>
        <span aria-hidden="true" className="text-border-subtle">
          ·
        </span>
        <Link
          href={`/${academySlug}/register-teacher`}
          className="font-semibold text-brand-700 dark:text-brand-300"
        >
          {t("staff.register")}
        </Link>
      </section>
    </div>
  );
}

/**
 * One running circle.
 *
 * The turn is the headline because it is the question a student refreshes the
 * page to answer: not "is there a circle" but "has my turn come". When nobody
 * is reciting the card says so plainly rather than leaving an empty row —
 * between turns is a real state and pretending otherwise reads as broken.
 */
function LiveCircleCard({
  circle,
  academySlug,
  locale,
  typeLabel,
  t,
}: {
  circle: LiveCircle;
  academySlug: string;
  locale: string;
  typeLabel: string;
  t: Awaited<ReturnType<typeof getTranslations<"home">>>;
}) {
  return (
    <article
      className="overflow-hidden rounded-2xl border-2 border-accent-400
                 bg-surface shadow-[0_2px_10px_rgba(196,145,58,0.14)]"
    >
      <header className="flex items-center justify-between gap-3 bg-accent-100 px-4 py-3 dark:bg-accent-700/20">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">
            {circle.teacher_name}
          </p>
          <p className="truncate text-xs text-accent-700 dark:text-accent-300">
            {typeLabel}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-accent-700 dark:text-accent-300">
          {formatTime(circle.start_time, locale)}
        </span>
      </header>

      {circle.reciting_name ? (
        <div className="flex items-center gap-3 px-4 pt-3">
          {/* Her initial, the same avatar the rest of the app uses for a
              person. The design has the queue position here; the initial says
              more at a glance — a student scanning for her own name finds the
              letter before she finishes reading the row. */}
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                       bg-accent-500 font-display text-sm font-bold text-white"
          >
            {circle.reciting_name.trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("live.turnNow")}</p>
            <p className="truncate font-semibold">{circle.reciting_name}</p>
          </div>
        </div>
      ) : (
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          {t("live.openQueue")}
        </p>
      )}

      <p className="flex items-center gap-2 px-4 pt-2 text-xs text-muted-foreground">
        <span>{t("live.waiting", { count: circle.waiting_count })}</span>
        <span aria-hidden="true" className="text-border-subtle">
          ·
        </span>
        <span>{t("live.done", { count: circle.done_count })}</span>
      </p>

      <div className="p-4">
        <Link
          href={`/${academySlug}/circle/${circle.registration_slug}`}
          className="btn-primary w-full"
        >
          {t("live.join")}
        </Link>
      </div>
    </article>
  );
}
