import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { PAGE_COUNT } from "@/lib/quran/structure";
import type { MushafAyah } from "@/lib/database.types";
import { MushafPageView } from "./mushaf-page-view";
import { RememberPage } from "./remember-page";

type MushafPageProps = {
  params: Promise<{ locale: string; academy: string; page: string }>;
};

/**
 * The Quran does not change, so a page is rendered once and cached for a day.
 *
 * Deliberately NOT `force-dynamic` like the rest of this app: every other page
 * here is somebody's live data, and this one is the only page in the codebase
 * whose content is fixed for all readers and all time.
 */
export const revalidate = 86400;

/** 604 pages, known in advance — but built on demand rather than all at once. */
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: MushafPageProps): Promise<Metadata> {
  const { locale, page } = await params;
  const t = await getTranslations({ locale, namespace: "mushaf" });
  return { title: `${t("title")} — ${t("page", { page: Number(page) })}` };
}

/**
 * THE MUSHAF READER.
 *
 * Drawn as a PAGE, not a scroll of verses. These students memorise by position
 * on the Madani page — "the ayah at the bottom of the left column" is how a
 * حافظة finds her place — and a list that reflows to the screen fights the
 * exact thing she is trying to remember. So the page boundaries are the real
 * ones (604, King Fahd layout) and the text runs justified inside a frame.
 *
 * THE TEXT IS NEVER TOUCHED. It is rendered exactly as stored, and stored
 * exactly as published (Tanzil, unmodified). Nothing in this file inserts a
 * symbol: ۩ and ۞ are already inside the ayat that carry them. That rule
 * exists because it was broken once — an earlier mockup "added" them and
 * produced ۩۩ — and the general form is: rendering styles what is there.
 *
 * THE HAND IS THE MUSHAF'S OWN: DigitalKhatt, drawn after the Madinah mushaf
 * and licensed SIL OFL, so it needs nobody's permission. Both it and the text
 * are رواية حفص عن عاصم — the text verified at the places the readings differ
 * («مَٰلِكِ» with the dagger alef, «نُنشِزُهَا» with the zay) and by the count,
 * 6236, which is the Kufan count Hafs uses.
 *
 * WHAT IS STILL NOT THE PRINTED PAGE: the LINE BREAKS. Reproducing those needs
 * either the Complex's per-page fonts or its layout data. The page breaks are
 * the real ones; where each line ends inside a page is ours.
 */
export default async function MushafReaderPage({ params }: MushafPageProps) {
  const { locale, academy: academySlug, page: pageParam } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("mushaf");
  const page = Number(pageParam);

  if (!Number.isInteger(page) || page < 1 || page > PAGE_COUNT) notFound();

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mushaf_page", { p_page: page });

  if (error) {
    console.error("mushaf_page failed", error);
  }
  const ayahs = (data ?? []) as MushafAyah[];
  if (ayahs.length === 0) notFound();

  return (
    <div className="flex flex-col gap-4">
      <RememberPage
        academySlug={academySlug}
        page={page}
        surah={ayahs[0].surah}
      />
      <MushafPageView
        academySlug={academySlug}
        page={page}
        ayahs={ayahs}
        locale={locale}
      />
    </div>
  );
}

