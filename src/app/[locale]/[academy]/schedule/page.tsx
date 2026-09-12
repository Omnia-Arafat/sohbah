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

        {/*
          Jump links to each board.

          One board of 18 circles across seven days is ~2000px tall, so with
          several boards the ones below the first are effectively invisible on a
          phone — a reader scrolls, sees one timetable, and concludes that is the
          whole page. This puts every board's name in the first screen, and the
          count next to it says what is down there.

          Plain anchors, so they work before any JavaScript loads and can be
          shared as a link straight to one section.
        */}
        {loadedBoards.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label={t("jumpTo")}>
            {loadedBoards.map((loaded) => {
              const count = loaded.days.reduce(
                (sum, day) => sum + day.entries.length,
                0,
              );
              return (
                <a
                  key={loaded.board.id}
                  href={`#board-${loaded.board.id}`}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm
                             font-medium transition-colors hover:border-brand-600
                             hover:text-brand-700 dark:hover:text-brand-300"
                >
                  {locale === "ar" ? loaded.board.title_ar : loaded.board.title_en}
                  <span className="ms-1.5 text-xs text-muted-foreground">{count}</span>
                </a>
              );
            })}
          </nav>
        )}
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
