import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarRange, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScheduleBoardCard } from "@/components/schedule-board-card";
import { ScheduleQuickCard } from "@/components/schedule-quick-card";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { Link } from "@/i18n/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { arNum } from "@/lib/schedule-format";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadBoardsWithCircles, loadScheduleBoards } from "@/lib/schedule-boards";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Circles move; a cached timetable would quietly show last week's. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "schedule" });
  return { title: t("title") };
}

export default async function SchedulePage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Behind the site's sign-in (proxy.ts), and filtered to the viewer's side.
  // RLS shows only published boards to a visitor, and an academy's own admin
  // their unpublished drafts as well.
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("schedule");
  const supabase = await createClient();

  const [boards, circleTypes] = await Promise.all([
    loadScheduleBoards(supabase, academy.id, { publishedOnly: false }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);
  // Men and women each see only their own side's timetable. See lib/viewer.ts.
  const viewer = await getViewer(academy.id);
  const loadedBoards = await loadBoardsWithCircles(academy.id, boards, viewer);

  // Staff get the weekly track schedules here as well; a مشرفة or admin can
  // also write one without going through المسارات first. A plain معلمة does
  // not get the builder: the page and its save action are for supervisors.
  const session = await getTeacherSession();
  const staff = session && isActiveTeacher(session) ? session.teacher : null;
  const canWrite = staff ? canSupervise(staff) : false;
  const here = `/${academySlug}/schedule`;
  const circlesCount = (n: number) =>
    t("circlesCount", { count: locale === "ar" ? arNum(n) : n });

  return (
    /*
      On a phone the timetable comes straight after the title: the label above
      it and the line under it are hidden, the two buttons share one short
      row, and «جدول الأسبوع» moves below the timetable (order-last), so the
      circles are not three screens down. The desktop keeps its order.
    */
    <div className="flex flex-col gap-4 sm:gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-col sm:min-w-56">
          <span className="text-sm font-semibold text-muted-foreground max-sm:hidden">{t("eyebrow")}</span>
          <h1 className="text-2xl font-black sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground max-sm:hidden">{t("subtitle")}</p>
        </div>
        {canWrite && (
          <div className="flex w-full gap-2 sm:w-auto sm:gap-2.5">
            <Link
              href={`/${academySlug}/admin/tracks/schedules/new`}
              className="btn-primary flex-1 whitespace-nowrap max-sm:min-h-11 max-sm:px-3 max-sm:py-2 max-sm:text-sm sm:flex-none"
            >
              <Plus className="size-5" aria-hidden="true" />
              {t("newTrackSchedule")}
            </Link>
            <Link
              href={`/${academySlug}/admin/tracks/schedules`}
              className="btn-secondary flex-1 whitespace-nowrap max-sm:min-h-11 max-sm:px-3 max-sm:py-2 max-sm:text-sm sm:flex-none"
            >
              <CalendarRange className="size-5" aria-hidden="true" />
              {t("trackSchedules")}
            </Link>
          </div>
        )}
      </header>

      {staff && (
        <div className="max-sm:order-last">
          <ScheduleQuickCard
            academyId={academy.id}
            academySlug={academySlug}
            teacher={staff}
            backHref={here}
          />
        </div>
      )}

      {loadedBoards.length > 0 && staff && (
        <h2 className="-mb-2 text-lg font-black max-sm:hidden">{t("circlesTimetable")}</h2>
      )}

      {loadedBoards.length === 0 ? (
        <p className="card text-center font-bold text-muted-foreground">{t("noBoards")}</p>
      ) : (
        /*
          One board at a time, chosen from a tab strip, rather than all of them
          stacked. Four boards ran to nearly 3000px and the first — 18 circles
          over seven days — buried the rest well enough that they read as
          missing. Every board is still rendered; the tabs only choose which is
          shown, so switching costs no request.

          A single board needs no tab strip: it would be a filter with one
          option, which is just a label.
        */
        <ScheduleTabs
          tabs={loadedBoards.map((loaded) => ({
            id: loaded.board.id,
            label: locale === "ar" ? loaded.board.title_ar : loaded.board.title_en,
            sub: circlesCount(loaded.days.reduce((sum, day) => sum + day.entries.length, 0)),
          }))}
        >
          {loadedBoards.map((loaded, index) => (
            <ScheduleBoardCard
              key={loaded.board.id}
              loaded={loaded}
              academySlug={academySlug}
              locale={locale}
              typeLabel={circleTypeLabel(
                circleTypes,
                loaded.board.circle_type,
                locale,
              )}
              index={index}
            />
          ))}
        </ScheduleTabs>
      )}

    </div>
  );
}
