"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { bookmarkKey, getBookmark, subscribeBookmark } from "@/lib/bookmark-store";
import { surahByNumber } from "@/lib/quran/surahs";

/**
 * The mushaf's place on the home screen — a full-width strip, not a tile.
 *
 * It is full width because it has to keep its place on a day with no circles
 * at all. On those days it is the only thing on this page a student can
 * actually do, and a tile tucked beside something else would disappear.
 *
 * It says "أكملي من حيث توقفت" only when there is somewhere to continue from.
 * The bookmark lives in her own browser (see `bookmark-store.ts`) — students
 * have no accounts, and a reading position is a convenience for a device, not
 * a record worth an identity.
 */
export function MushafCard({
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
    // The server render has no browser storage to read, so it always renders
    // the "open the mushaf" state; the bookmark arrives on hydration.
    () => null,
  );

  const surah = bookmark ? surahByNumber(bookmark.surah) : undefined;
  const href = `/${academySlug}/mushaf/${bookmark?.page ?? 1}`;

  return (
    <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
      <div className="flex items-center gap-2">
        <BookOpen
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"
        />
        <h2 className="font-display text-lg font-bold">{t("mushaf.title")}</h2>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {bookmark && surah
          ? t("mushaf.resume", {
              surah: locale === "ar" ? surah.name : surah.englishName,
              page: bookmark.page,
            })
          : t("mushaf.start")}
      </p>

      <Link href={href} className="btn-primary mt-3 w-full">
        {bookmark ? t("mushaf.resumeCta") : t("mushaf.cta")}
      </Link>
    </section>
  );
}
