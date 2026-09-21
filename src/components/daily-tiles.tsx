"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { BookOpen, Sunrise } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { bookmarkKey, getBookmark, subscribeBookmark } from "@/lib/bookmark-store";
import { surahByNumber } from "@/lib/quran/surahs";

/**
 * المصحف and الأذكار, side by side.
 *
 * They were two full-width cards stacked, each with a heading, a sentence and
 * a button — about 260px of screen for two links, pushing صفحتك and التسجيل
 * off the bottom of a phone. They are the same KIND of thing, which is what
 * makes a pair right: the two screens a student opens on her own, every day,
 * whether or not a circle is running, and the only two in the app that need
 * no connection at all.
 *
 * So: an icon, a word, and one line under it. The whole tile is the link —
 * there is no button, because a tile with one destination does not need a
 * second thing to press inside it.
 *
 * The mushaf keeps the one detail worth the space: where she stopped. That is
 * the difference between "here is the mushaf" and "here is your page", and it
 * is the reason she taps it rather than scrolling past. The bookmark lives in
 * her own browser — students have no accounts, and a reading position is a
 * convenience for a device, not a record worth an identity.
 */
export function DailyTiles({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("home");
  const key = useMemo(() => bookmarkKey(academySlug), [academySlug]);

  const bookmark = useSyncExternalStore(
    subscribeBookmark,
    useCallback(() => getBookmark(key), [key]),
    // The server has no browser storage to read, so it renders "open the
    // mushaf"; the bookmark arrives on hydration.
    () => null,
  );

  const surah = bookmark ? surahByNumber(bookmark.surah) : undefined;

  return (
    <section className="grid grid-cols-2 gap-3">
      <Tile
        href={`/${academySlug}/mushaf/${bookmark?.page ?? 1}`}
        Icon={BookOpen}
        title={t("mushaf.title")}
        tone="brand"
        note={
          bookmark && surah
            ? // The surah's name is Uthmani — ٱلۡبَقَرَةِ carries an alef wasla
              // and a small sukun, neither of which Cairo has — so it is drawn
              // in the same font as the مصحف itself while the sentence around
              // it stays UI text.
              t.rich("mushaf.tileResume", {
                surah: locale === "ar" ? surah.name : surah.englishName,
                page: bookmark.page,
                q: (chunks) => <span className="font-quran">{chunks}</span>,
              })
            : t("mushaf.tileStart")
        }
      />
      <Tile
        href={`/${academySlug}/adhkar`}
        Icon={Sunrise}
        title={t("adhkar.title")}
        tone="accent"
        note={t("adhkar.tileNote")}
      />
    </section>
  );
}

function Tile({
  href,
  Icon,
  title,
  note,
  tone,
}: {
  href: string;
  Icon: typeof BookOpen;
  title: string;
  note: React.ReactNode;
  tone: "brand" | "accent";
}) {
  /*
    Two tones so the pair does not read as one block of green. Gold is not
    "happening now" here — nothing on a tile is live — it is simply the second
    colour this app owns, and the أذكار are the natural place for it: they are
    the morning and the evening.
  */
  const ring =
    tone === "brand"
      ? "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface"
      : "border-accent-300 bg-accent-100/40 dark:border-accent-700 dark:bg-surface";
  const iconColour =
    tone === "brand"
      ? "text-brand-700 dark:text-brand-300"
      : "text-accent-700 dark:text-accent-400";

  return (
    <Link
      href={href}
      className={`card flex flex-col gap-1.5 p-4 transition-colors active:opacity-90 ${ring}`}
    >
      <Icon className={`h-6 w-6 shrink-0 ${iconColour}`} aria-hidden="true" />
      <h2 className="font-display text-base font-bold leading-tight">{title}</h2>
      {/* Two lines at most: the tiles sit in a grid and must match heights,
          and a third line of explanation is not what makes anyone tap. */}
      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{note}</p>
    </Link>
  );
}
