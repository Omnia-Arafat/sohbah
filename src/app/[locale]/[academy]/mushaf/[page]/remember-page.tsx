"use client";

import { useEffect } from "react";
import { bookmarkKey, setBookmark } from "@/lib/bookmark-store";

/**
 * Records the page being read, so the home screen can say "أكملي من حيث
 * توقفتِ".
 *
 * Renders nothing. It exists because the reader itself is a server component
 * — the Quran is the same for every reader and is cached for a day — while the
 * bookmark is the one thing on that page that belongs to this browser alone.
 *
 * Writing to a store on mount is the "update an external system with the
 * latest state from React" case an effect is actually for.
 */
export function RememberPage({
  academySlug,
  page,
  surah,
}: {
  academySlug: string;
  page: number;
  surah: number;
}) {
  useEffect(() => {
    setBookmark(bookmarkKey(academySlug), {
      page,
      surah,
      savedAt: new Date().toISOString(),
    });
  }, [academySlug, page, surah]);

  return null;
}
