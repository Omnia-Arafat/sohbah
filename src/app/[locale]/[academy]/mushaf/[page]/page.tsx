import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft, List } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { surahByNumber } from "@/lib/quran/surahs";
import { PAGE_COUNT } from "@/lib/quran/structure";
import type { MushafAyah } from "@/lib/database.types";
import { RememberPage } from "./remember-page";
import { SwipePages } from "./swipe-pages";

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

  const firstSurah = surahByNumber(ayahs[0].surah);
  const juz = ayahs[0].juz;

  return (
    <div className="flex flex-col gap-4">
      <RememberPage
        academySlug={academySlug}
        page={page}
        surah={ayahs[0].surah}
      />

      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold">
            {locale === "ar" ? firstSurah?.name : firstSurah?.englishName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("juz", { juz })} · {t("page", { page })}
          </p>
        </div>
        <Link
          href={`/${academySlug}/mushaf`}
          aria-label={t("index")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                     border border-border-subtle text-muted-foreground
                     transition-colors hover:border-brand-600 hover:text-brand-700
                     dark:hover:text-brand-300"
        >
          <List className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      {/*
        The double frame is the printed mushaf's own: a gold outer rule and a
        paler inner one. It is the one place in this app where gold is not
        "happening now" — here it is not a status at all, it is the page.
      */}
      <SwipePages academySlug={academySlug} page={page} lastPage={PAGE_COUNT}>
        <div className="rounded-2xl border border-accent-300 bg-accent-100/25 p-1.5 dark:border-accent-700 dark:bg-accent-700/10">
          <div className="rounded-xl border border-accent-200 px-4 py-5 dark:border-accent-700/60">
            <p
              dir="rtl"
              lang="ar"
              className="font-quran text-center text-[1.35rem] leading-[2.6]"
            >
              {ayahs.map((entry) => (
                <Ayah key={`${entry.surah}:${entry.ayah}`} entry={entry} />
              ))}
            </p>
          </div>
        </div>
      </SwipePages>

      <nav className="flex items-center justify-between gap-3">
        <PageLink
          href={`/${academySlug}/mushaf/${page - 1}`}
          label={t("prev")}
          disabled={page <= 1}
          direction="prev"
        />
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          {t("page", { page })} / {PAGE_COUNT}
        </span>
        <PageLink
          href={`/${academySlug}/mushaf/${page + 1}`}
          label={t("next")}
          disabled={page >= PAGE_COUNT}
          direction="next"
        />
      </nav>

      <p className="text-center text-xs text-muted-foreground">{t("swipeHint")}</p>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-display text-base text-brand-700 dark:text-brand-300">
            ۩
          </span>
          {t("legend.sajda")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-display text-base text-accent-600">۞</span>
          {t("legend.hizb")}
        </span>
      </div>

      {/* Attribution is a licence condition, not decoration. */}
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        {t("attribution")}
      </p>
    </div>
  );
}

/**
 * One ayah, with its number in the traditional ۝-style brackets after it.
 *
 * The heading for a new surah is drawn here rather than above the block, so a
 * page that opens a surah reads exactly as the printed one does: the previous
 * surah ends, the title sits in the flow, and the text continues.
 */
function Ayah({ entry }: { entry: MushafAyah }) {
  const surah = surahByNumber(entry.surah);

  return (
    <>
      {/*
        The surah's name, and NOTHING ELSE.

        An earlier version of this file also drew a البسملة here, and that was
        the ۩۩ mistake repeated: in this edition the البسملة is already the
        opening of every surah's first ayah — every surah but التوبة, which
        correctly has none. Drawing it as well printed it twice.

        The rule, once more: this app renders what is in the text and never
        adds to it. If something looks missing, it is missing from the source
        and the source is what gets checked.
      */}
      {entry.starts_surah && (
        <span className="my-3 block">
          <span
            className="block rounded-xl border border-accent-300 bg-accent-100/50
                       py-2 text-lg font-bold leading-normal text-accent-700
                       dark:border-accent-700 dark:bg-accent-700/15 dark:text-accent-300"
          >
            {surah?.name}
          </span>
        </span>
      )}
      <span className={entry.sajda ? "text-brand-800 dark:text-brand-200" : undefined}>
        {entry.text}
      </span>
      <span className="mx-1 inline-block align-middle text-sm text-accent-600 dark:text-accent-400">
        ﴿{toArabicDigits(entry.ayah)}﴾
      </span>{" "}
    </>
  );
}

function PageLink({
  href,
  label,
  disabled,
  direction,
}: {
  href: string;
  label: string;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const base =
    "flex h-11 w-11 items-center justify-center rounded-xl border " +
    "border-border-subtle text-muted-foreground transition-colors";

  if (disabled) {
    return (
      <span aria-hidden="true" className={`${base} opacity-30`}>
        <ChevronLeft
          className={`h-5 w-5 ${direction === "next" ? "" : "rotate-180"}`}
        />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${base} hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-300`}
    >
      {/*
        The mushaf turns right-to-left whatever the interface language: page 2
        is to the LEFT of page 1 in the book itself. So these arrows are fixed,
        not mirrored with the locale.
      */}
      <ChevronLeft
        aria-hidden="true"
        className={`h-5 w-5 ${direction === "next" ? "" : "rotate-180"}`}
      />
    </Link>
  );
}

/**
 * Ayah numbers are Arabic-Indic here and nowhere else in this app.
 *
 * Everywhere else a number is data — a queue position, an error count — and
 * the app writes those in the digits the rest of its interface uses. Inside
 * the ۝ of a mushaf the numeral is part of the page, and ٥٢ is what is
 * printed there.
 */
function toArabicDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) =>
    String.fromCharCode(0x0660 + Number(digit)),
  );
}
