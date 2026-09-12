import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays } from "lucide-react";
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
import { notFound } from "next/navigation";
import Image from "next/image";

type AcademyHomeProps = {
  params: Promise<{ locale: string; academy: string }>
};

/** Circles move, and this page now shows today's — never serve a cached week. */
export const dynamic = "force-dynamic";

export default async function AcademyHome({ params }: AcademyHomeProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations("home");
  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);

  /*
    Read through the same boards the public timetable uses, so this card and
    that page can never disagree about what is on today — and so a circle whose
    type has no published board is absent from both rather than from one.

    `days[0]` is today: `loadBoardsWithCircles` rotates the week to start there,
    and only includes a day that actually has circles. So the first entry is
    today's row when `todayIndex` matches it, and otherwise today has none.
  */
  const supabase = await createClient();
  const boards = await loadScheduleBoards(supabase, academy.id);
  const loadedBoards = await loadBoardsWithCircles(supabase, academy.id, boards);

  // A circle can sit on more than one board (a type board and a section board),
  // so collapse by circle id rather than showing it twice.
  const todayById = new Map<string, ScheduleEntry>();
  for (const loaded of loadedBoards) {
    const todayRow = loaded.days.find((day) => day.day === loaded.todayIndex);
    for (const entry of todayRow?.entries ?? []) {
      todayById.set(entry.circleId, entry);
    }
  }
  const todayCircles = [...todayById.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center text-center">
        {academy.logo_path ? (
          <div className="relative h-20 w-20">
            <Image
              src={academy.logo_path}
              alt={academyName}
              fill
              className="object-contain"
            />
          </div>
        ) : (
          <BrandMark className="h-20 w-20" />
        )}
        <h1 className="font-display mt-4 text-3xl font-bold sm:text-4xl">
          {academyName}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/*
        Today's circles, before anything that asks who you are.

        This page is the front door for people who never sign in — students and
        their families. What they came to find out is "is there a circle today,
        and when" — and until now the page answered with two sign-in doors and
        a calendar icon in the header, which on a phone was an unlabelled icon.

        So today's circles come first, each one a link straight into its own
        page, with the full week one tap away.
      */}
      <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display flex items-center gap-2 text-xl font-bold">
            <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden="true" />
            {t("today.title")}
          </h2>
          <Link
            href={`/${academySlug}/schedule`}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {t("today.fullWeek")}
          </Link>
        </div>

        {todayCircles.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t("today.none")}</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {todayCircles.map((entry) => (
              <li key={entry.circleId}>
                <Link
                  href={`/${academySlug}/circle/${entry.registrationSlug}`}
                  className="group inline-flex items-center gap-2 rounded-xl border
                             border-border-subtle bg-surface px-3 py-2 text-sm
                             transition-all hover:-translate-y-0.5 hover:border-brand-500
                             hover:shadow-sm"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                               bg-brand-100 font-display text-sm font-bold text-brand-700
                               dark:bg-brand-800 dark:text-brand-100"
                  >
                    {entry.teacherName.trim().charAt(0)}
                  </span>
                  <span className="font-medium group-hover:text-brand-700 dark:group-hover:text-brand-300">
                    {entry.teacherName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(entry.startTime, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Two doors, deliberately side by side. The two audiences are entirely
        separate: students never authenticate, teachers always do.
      */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card flex flex-col border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <span className="badge-done self-start">{t("doors.students.tag")}</span>
          <h2 className="mt-3 text-xl font-semibold">{t("doors.students.title")}</h2>
          <p className="mt-2 flex-1 text-muted-foreground">
            {t("doors.students.body")}
          </p>
          <Link href={`/${academySlug}/register`} className="btn-primary mt-4 w-full">
            {t("doors.students.cta")}
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("doors.students.note")}
          </p>
        </div>

        <div className="card flex flex-col">
          <span className="badge-waiting self-start">{t("doors.teachers.tag")}</span>
          <h2 className="mt-3 text-xl font-semibold">{t("doors.teachers.title")}</h2>
          <p className="mt-2 flex-1 text-muted-foreground">
            {t("doors.teachers.body")}
          </p>
          <Link href={`/${academySlug}/login`} className="btn-primary mt-4 w-full">
            {t("doors.teachers.cta")}
          </Link>
          {/*
            Registering is the other half of this door, not a footnote: a new
            معلمة has no account yet, and this is the first place she looks.
          */}
          <Link
            href={`/${academySlug}/register-teacher`}
            className="btn-secondary mt-2 w-full"
          >
            {t("doors.teachers.register")}
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("doors.teachers.note")}
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold">{t("returningStudent.title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("returningStudent.body")}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("returningStudent.note")}
        </p>
      </section>
    </div>
  );
}
