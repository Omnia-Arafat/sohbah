import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScheduleBoardCard } from "@/components/schedule-board-card";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadBoardsWithCircles, loadScheduleBoards } from "@/lib/schedule-boards";
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

  // Deliberately unauthenticated: the timetable is the academy's public notice
  // board. RLS shows only published boards to a visitor, and an academy's own
  // admin their unpublished drafts as well.
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("schedule");
  const supabase = await createClient();

  const [boards, circleTypes] = await Promise.all([
    loadScheduleBoards(supabase, academy.id, { publishedOnly: false }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);
  const loadedBoards = await loadBoardsWithCircles(supabase, academy.id, boards);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <CalendarDays className="h-7 w-7 text-brand-600" aria-hidden="true" />
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {loadedBoards.length === 0 ? (
        <p className="card text-center text-muted-foreground">{t("noBoards")}</p>
      ) : (
        <div className="flex flex-col gap-5">
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
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
