import { CalendarRange, Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSupervise, isAdminRole } from "@/lib/auth/roles";
import { getScheduleCatalog } from "@/lib/schedule-dal";
import { arNum, cohortWeek, encodeSheet } from "@/lib/schedule-format";
import { ScheduleQuickPicker, type QuickCohort } from "./schedule-quick-picker";

type Teacher = Parameters<typeof canSupervise>[0] & { id: string };

/**
 * «جدول الأسبوع» on the staff home: this week's schedule of each of her
 * cohorts in one tap, and any other week or cohort one step further.
 *
 * Whose cohorts: a معلمة her own; a مشرفة her own and the ones she
 * supervises; the admin every running cohort.
 */
export async function ScheduleQuickCard({
  academyId,
  academySlug,
  teacher,
  backHref,
}: {
  academyId: string;
  academySlug: string;
  teacher: Teacher;
  /** Where the printed sheet's back link returns to; the home page by default. */
  backHref?: string;
}) {
  const tracks = await getScheduleCatalog(academyId);
  if (tracks.length === 0) return null;

  const admin = isAdminRole(teacher);
  let supervised = new Set<string>();
  if (!admin && canSupervise(teacher)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("track_cohort_supervisors" as never)
      .select("cohort_id")
      .eq("teacher_id" as never, teacher.id as never);
    supervised = new Set(((data ?? []) as unknown as { cohort_id: string }[]).map((r) => r.cohort_id));
  }

  const cohorts: QuickCohort[] = [];
  for (const t of tracks) {
    for (const c of t.cohorts) {
      if (c.status !== "running") continue;
      const mine = admin || c.teacherId === teacher.id || supervised.has(c.id);
      if (!mine) continue;
      cohorts.push({
        trackId: t.id,
        cohortId: c.id,
        label: `${t.name} · ${c.name}`,
        currentWeek: cohortWeek(c.startDate, t.durationWeeks),
        durationWeeks: t.durationWeeks,
      });
    }
  }
  if (cohorts.length === 0) return null;

  const back = backHref ?? `/${academySlug}/dashboard`;
  const quick = cohorts.slice(0, 4);

  return (
    <section aria-labelledby="week-schedule" className="relative flex flex-col gap-3 overflow-hidden rounded-3xl bg-brand-600 p-4 text-white sm:p-5">
      <div className="flex items-center gap-2">
        <CalendarRange className="size-5 text-lime-300" aria-hidden="true" />
        <h2 id="week-schedule" className="text-lg font-black">جدول الأسبوع</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {quick.map((c) => (
          <Link
            key={c.cohortId}
            href={`/${academySlug}/print/schedule?s=${encodeSheet({ trackId: c.trackId, cohort: c.cohortId, week: c.currentWeek })}&back=${encodeURIComponent(back)}`}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-3 text-foreground"
          >
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-black">{c.label}</span>
              <span className="text-xs font-bold text-muted-foreground">الأسبوع الحالي · {arNum(c.currentWeek)}</span>
            </span>
            <span className="flex size-10 items-center justify-center rounded-xl bg-lime-100 text-brand-700">
              <Download className="size-5" aria-hidden="true" />
              <span className="sr-only">نزّلي</span>
            </span>
          </Link>
        ))}
      </div>
      <ScheduleQuickPicker academySlug={academySlug} cohorts={cohorts} backHref={back} />
    </section>
  );
}
