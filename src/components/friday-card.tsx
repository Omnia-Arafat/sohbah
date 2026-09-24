"use client";

import { BookOpen, ChevronLeft, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FridayBadge } from "@/components/friday-badge";
import {
  KAHF_PAGES,
  formatCount,
  kahfCount,
  nextMilestone,
  previousMilestone,
  topMilestone,
} from "@/lib/friday";
import { useFriday } from "@/lib/use-friday";

/**
 * The تحدي الجمعة card, on the student's home and on the staff dashboard.
 *
 * It exists only from مغرب الخميس to مغرب الجمعة and renders nothing the rest
 * of the week: a card saying "come back Thursday" on six days out of seven is
 * a card people learn to scroll past.
 *
 * Deep green, not gold — gold is for a circle running right now, and on a
 * Friday with one that card still sits above this.
 */
export function FridayCard({ academySlug, locale }: { academySlug: string; locale: string }) {
  const t = useTranslations("friday");
  const { window, entry } = useFriday(academySlug);

  if (!window?.active) return null;

  const count = entry.salawat;
  const next = nextMilestone(count);
  const prev = previousMilestone(count);
  const pct = Math.round(((count - prev) / (next - prev)) * 100);
  const top = topMilestone(count);
  const pages = kahfCount(entry.kahf);
  const digits = (n: number) => formatCount(n, locale);

  return (
    <section
      aria-labelledby="friday-card"
      className="flex flex-col gap-3 rounded-2xl bg-brand-900 p-4 text-white shadow-sm dark:bg-brand-950"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="friday-card" className="text-sm font-bold text-brand-200">
          {t("cardTitle")}
        </h2>
        <span className="text-[11px] text-brand-200">{t("untilMaghrib")}</span>
      </div>
      <p className="font-display text-lg leading-relaxed">{t("hadithSalawat")}</p>

      <Link
        href={`/${academySlug}/friday`}
        className="flex items-center gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15"
      >
        <FridayBadge milestone={top || next} locked={!top} size={44} />
        <span className="flex min-w-0 flex-grow flex-col gap-1.5">
          <span className="text-[15px] font-bold">{t("salawatTitle")}</span>
          <span className="text-xs text-brand-100">
            {t("soFar", { count: digits(count) })} ·{" "}
            {t("toNext", { left: digits(next - count), next: digits(next) })}
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-black/25">
            <span className="block h-full rounded-full bg-brand-200" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-200 ltr:rotate-180" />
      </Link>

      <Link
        href={`/${academySlug}/friday/kahf`}
        className="flex items-center gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/20">
          <BookOpen aria-hidden="true" className="h-5 w-5 text-brand-200" />
        </span>
        <span className="flex min-w-0 flex-grow flex-col gap-1.5">
          <span className="text-[15px] font-bold">{t("kahfTitle")}</span>
          <span className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: KAHF_PAGES }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  entry.kahf & (1 << i) ? "bg-brand-200" : "bg-black/25"
                }`}
              />
            ))}
          </span>
          <span className="text-xs text-brand-100">
            {pages === KAHF_PAGES ? t("kahfFinished") : t("kahfCount", { count: digits(pages) })}
          </span>
        </span>
        <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-200 ltr:rotate-180" />
      </Link>

      <Link
        href={`/${academySlug}/friday/share`}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-brand-900"
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        {t("shareCta")}
      </Link>
    </section>
  );
}
