"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { MushafAyah } from "@/lib/database.types";
import { PAGE_COUNT } from "@/lib/quran/structure";
import { surahByNumber } from "@/lib/quran/surahs";
import { attachMarks, splitBasmala } from "@/lib/quran/text";
import { SwipePages } from "./swipe-pages";

/**
 * The mushaf page itself, and the one renderer for it.
 *
 * It is a client component for a single reason: OFFLINE.
 *
 * The service worker can only replay a document it has already seen, so a page
 * the reader never opened cannot be served while she has no signal — and "the
 * mushaf works offline, except the parts you have not read yet" is not a
 * mushaf that works offline. When that happens the worker hands her ANY
 * mushaf document it does hold, and this component notices that the page in
 * the address bar is not the page it was given and redraws the right one from
 * `/quran/pages.json`, which is precached with the app.
 *
 * So there are two sources and one renderer. Online, the server reads the page
 * from the database and passes it in — first paint is real HTML, unchanged
 * from before. Offline, the correction below takes over. Neither path draws
 * the mushaf differently from the other, because there is only one place that
 * draws it.
 */

/** The compact on-disk shape: see scripts/export-quran.mjs. */
type PackedAyah = [
  surah: number,
  ayah: number,
  juz: number,
  sajda: 0 | 1,
  startsSurah: 0 | 1,
  text: string,
];

function unpack(rows: PackedAyah[]): MushafAyah[] {
  return rows.map(([surah, ayah, juz, sajda, startsSurah, text]) => ({
    surah,
    ayah,
    juz,
    sajda: sajda === 1,
    text,
    starts_surah: startsSurah === 1,
  }));
}

/**
 * The page number the reader actually asked for, read from the address bar
 * rather than from props — those are whatever the worker had lying around.
 */
function pageFromLocation(): number | null {
  const match = window.location.pathname.match(/\/mushaf\/(\d+)\/?$/);
  if (!match) return null;
  const page = Number(match[1]);
  return page >= 1 && page <= PAGE_COUNT ? page : null;
}

export function MushafPageView({
  academySlug,
  page: serverPage,
  ayahs: serverAyahs,
  locale,
}: {
  academySlug: string;
  page: number;
  ayahs: MushafAyah[];
  locale: string;
}) {
  const t = useTranslations("mushaf");
  /*
    A correction is stamped with the document it was made against, rather than
    cleared when that document changes. Clearing would mean a setState on the
    ordinary path — every page, online included — to undo something that is
    almost never set; stamping lets a stale correction simply stop matching.
  */
  const [corrected, setCorrected] = useState<{
    forServerPage: number;
    page: number;
    ayahs: MushafAyah[];
  } | null>(null);

  /*
    Pull the whole mushaf into the cache the first time she opens a page.

    This used to be left to the service worker's precache, and on Vercel that
    never ran — locally the same build precaches 125 files, in production the
    cache simply never appears, while runtime caching works fine. The symptom
    was exactly what was reported: "I have to open a page once, then it works
    offline", because the only thing offline had to work with was the handful
    of documents she had already visited.

    So the text is fetched from here instead, where nothing can skip it. The
    worker's `sohbah-quran-text` rule is cache-first, so this costs 1.4MB once
    and is served from the cache every time after — including the fetch in the
    correction below, which is why that one does not need to wait on a network.

    Deferred to idle so it never competes with the page she is reading.
  */
  useEffect(() => {
    const warm = () => {
      fetch("/quran/pages.json").catch(() => {
        // Offline on her very first visit. Nothing to do and nothing to say:
        // the page she is on came from the server, so she is reading fine.
      });
    };

    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    // Safari has no requestIdleCallback.
    const timer = setTimeout(warm, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const wanted = pageFromLocation();
    // The ordinary case, online and off: the document matches the URL and
    // there is nothing to do.
    if (wanted === null || wanted === serverPage) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/quran/pages.json");
        const pages: Record<string, PackedAyah[]> = await res.json();
        const rows = pages[String(wanted)];
        if (!cancelled && rows?.length) {
          setCorrected({ forServerPage: serverPage, page: wanted, ayahs: unpack(rows) });
          // The document came from the cache under another page's name, so the
          // browser tab still carries that page's title. Everything visible is
          // corrected above; this is the one thing outside the tree.
          document.title = document.title.replace(/\d+/, String(wanted));
        }
      } catch {
        // No cached copy either. The page she is looking at is a real mushaf
        // page, just not the one she asked for — better than a blank screen,
        // and the address bar already tells her where she meant to be.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serverPage]);

  // A correction made against a document we have since navigated away from is
  // simply ignored.
  const active = corrected?.forServerPage === serverPage ? corrected : null;
  const page = active?.page ?? serverPage;
  const ayahs = active?.ayahs ?? serverAyahs;

  if (ayahs.length === 0) return null;

  const firstSurah = surahByNumber(ayahs[0].surah);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold">
            {locale === "ar" ? firstSurah?.name : firstSurah?.englishName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("juz", { juz: ayahs[0].juz })} · {t("page", { page })}
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
              /*
                Uthmani text carries far more marks per letter than ordinary
                Arabic, and at 1.35rem they had too few pixels to stay apart —
                a fatha over a shadda over a dagger alef merged into a smudge,
                which read as broken text rather than as small text.

                1.7rem is the smallest size at which they separate cleanly on
                a 375px phone, checked in the browser at that width with no
                horizontal overflow. Wider screens get more.
              */
              className="font-quran text-center text-[1.7rem] leading-[2.35] sm:text-[2rem] sm:leading-[2.4]"
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
  // Both text sources (server and pages.json) pass through here, so this is
  // the one place the marks are attached and the البسملة is lifted out.
  const { basmala, rest } = splitBasmala(
    entry.surah,
    entry.ayah,
    attachMarks(entry.text),
  );

  return (
    <>
      {/*
        The surah's name, and nothing added.

        An earlier version of this file drew a البسملة of its own here, and
        that printed it twice: in this edition it is already the opening of
        every surah's first ayah (التوبة correctly has none). What is drawn
        below is that same البسملة, lifted OUT of the ayah onto its own line
        as the printed mushaf sets it — moved, not added.

        The rule, once more: this app renders what is in the text and never
        adds to it.
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
      {basmala && <span className="mb-1 block">{basmala}</span>}
      <span className={entry.sajda ? "text-brand-800 dark:text-brand-200" : undefined}>
        {rest}
      </span>
      {/*
        The ayah marker, in the mushaf's own glyph.

        It used to be ﴿N﴾ at text-sm — three problems in one small mark.
        DigitalKhatt has the Arabic-Indic digits but NOT the ornate brackets
        U+FD3E/U+FD3F, so each bracket fell back to Amiri: two typefaces
        either side of the number, in a mark barely two thirds the height of
        the words around it.

        U+06DD ARABIC END OF AYAH is the character this actually is, and the
        font does have it. It is a prepended concatenation mark: the digits
        that follow are drawn INSIDE the rosette, which is how a mushaf sets
        an ayah number, and it comes from the same hand as the text.

        Sized in `em` so it tracks the ayah text wherever this renders, rather
        than a fixed size that only suits the mushaf page.
      */}
      <span className="mx-0.5 align-baseline text-[1.05em] text-accent-700 dark:text-accent-300">
        {"۝"}
        {toArabicDigits(entry.ayah)}
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
