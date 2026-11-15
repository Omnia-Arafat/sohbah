import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getAllWeeks, getScheduleCatalog } from "@/lib/schedule-dal";
import { cohortWeek } from "@/lib/schedule-format";
import { LibraryClient } from "./library-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ track?: string; cohort?: string; week?: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "جداول المسارات" };

/** «جداول المسارات»: every track's 40 weeks, as the track or one cohort sees them. */
export default async function SchedulesPage({ params, searchParams }: PageProps) {
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
  const weeks = await getAllWeeks(tracks.map((t) => t.id));
  const q = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-56 flex-1 flex-col">
          <span className="text-sm font-semibold text-muted-foreground">الإدارة · المسارات</span>
          <h1 className="text-2xl font-black">جداول المسارات</h1>
        </div>
        <Link href={`/${academySlug}/admin/tracks/schedules/new`} className="btn-primary">
          <Plus className="size-5" aria-hidden="true" />
          جدول أسبوعي جديد
        </Link>
      </header>

      {tracks.length === 0 ? (
        <div className="card font-semibold">مفيش مسارات لسه.</div>
      ) : (
        <LibraryClient
          academySlug={academySlug}
          tracks={tracks.map((t) => ({
            id: t.id,
            name: t.name,
            durationWeeks: t.durationWeeks,
            cohorts: t.cohorts.map((c) => ({
              id: c.id,
              name: c.name,
              startDate: c.startDate,
              currentWeek: c.status === "running" ? cohortWeek(c.startDate, t.durationWeeks) : null,
            })),
          }))}
          weeks={weeks}
          initial={{ track: q.track ?? null, cohort: q.cohort ?? null, week: Number(q.week) || null }}
        />
      )}
    </div>
  );
}
