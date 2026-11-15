import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getEffectiveWeek, getScheduleCatalog } from "@/lib/schedule-dal";
import { getPreviousWeekEnd } from "@/lib/track-week-dal";
import { emptyDays } from "@/lib/schedule-format";
import { BuilderClient } from "./builder-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ track?: string; cohort?: string; week?: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "جدول أسبوعي" };

/**
 * Write a week once and apply it to any number of (track, cohort, week)
 * places. Opened empty from «جدول أسبوعي جديد», or on an existing week from
 * the schedules list (?track=&cohort=&week=), which it then edits.
 */
export default async function NewSchedulePage({ params, searchParams }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

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
        <p className="font-semibold">الصفحة دي للمشرفات والإدارة.</p>
      </div>
    );
  }

  const tracks = await getScheduleCatalog(academy.id);
  if (tracks.length === 0) {
    return (
      <div className="card">
        <p className="font-semibold">مفيش مسارات لسه. أضيفي مسار الأول.</p>
      </div>
    );
  }

  const q = await searchParams;
  const track = tracks.find((t) => t.id === q.track) ?? tracks[0];
  const cohort = track.cohorts.some((c) => c.id === q.cohort) ? q.cohort! : "base";
  const weekNumber = Math.min(Math.max(1, Number(q.week) || 1), track.durationWeeks);

  const found = q.track ? await getEffectiveWeek(track.id, cohort === "base" ? null : cohort, weekNumber) : null;
  const week = found?.week ?? null;
  const previous = week ? null : await getPreviousWeekEnd(track.id, weekNumber);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <BackLink href={`/${academySlug}/admin/tracks/schedules`}>كل الجداول</BackLink>
      <h1 className="text-2xl font-black">{week ? "تعديل جدول أسبوعي" : "جدول أسبوعي جديد"}</h1>
      <BuilderClient
        academySlug={academySlug}
        tracks={tracks.map((t) => ({
          id: t.id,
          name: t.name,
          durationWeeks: t.durationWeeks,
          cohorts: t.cohorts.map((c) => ({ id: c.id, name: c.name })),
        }))}
        initialDays={week?.days ?? emptyDays()}
        initialTitle={week?.title ?? ""}
        initialMeetingWeekday={week?.meetingWeekday ?? null}
        initialMeetingTime={week?.meetingTime ?? ""}
        initialPublished={week?.isPublished ?? true}
        initialTargets={[{ trackId: track.id, cohort, week: weekNumber }]}
        defaultSurah={previous?.surah ?? 1}
      />
    </div>
  );
}
