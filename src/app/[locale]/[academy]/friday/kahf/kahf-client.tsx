"use client";

import { BookOpen, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  KAHF_ALL,
  KAHF_FIRST_PAGE,
  KAHF_PAGES,
  formatCount,
  kahfCount,
  kahfNextPage,
} from "@/lib/friday";
import { addKahf } from "@/lib/friday-store";
import { useFriday } from "@/lib/use-friday";
import { FridayClosed, FridayHeader } from "../friday-parts";

/**
 * سورة الكهف, as twelve pages.
 *
 * There is no "I read this page" button per page: a page ticks itself when
 * she turns it in the app's own مصحف (`RememberPage` → `noteMushafPage`).
 * Each tile opens its page. The one button is for a paper مصحف, which is how
 * plenty of them read الكهف on a Friday — the challenge should not punish it.
 */
export function KahfClient({ academySlug, locale }: { academySlug: string; locale: string }) {
  const t = useTranslations("friday");
  const { window, key, entry, flush } = useFriday(academySlug);

  if (!window) return null;

  const digits = (n: number) => formatCount(n, locale);
  const read = kahfCount(entry.kahf);
  const nextPage = kahfNextPage(entry.kahf);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <FridayHeader academySlug={academySlug} title={t("kahfTitle")} subtitle={t("kahfRange")} />

      <figure className="rounded-2xl bg-brand-900 p-4 text-white dark:bg-brand-950">
        <blockquote className="font-display text-lg leading-relaxed">{t("hadithKahf")}</blockquote>
        <figcaption className="mt-1 text-[11px] text-brand-200">{t("hadithKahfSource")}</figcaption>
      </figure>

      {!window.active ? (
        <FridayClosed startsAt={window.startsAt} locale={locale} />
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold leading-none text-brand-700 dark:text-brand-300">
              {digits(read)}
            </span>
            <span className="text-sm text-muted-foreground">{t("kahfOf")}</span>
          </p>

          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: KAHF_PAGES }, (_, i) => {
              const page = KAHF_FIRST_PAGE + i;
              const done = (entry.kahf & (1 << i)) !== 0;
              const isNext = page === nextPage;
              return (
                <Link
                  key={page}
                  href={`/${academySlug}/mushaf/${page}`}
                  aria-label={
                    done
                      ? t("pageRead", { page: digits(page) })
                      : isNext
                        ? t("pageNext", { page: digits(page) })
                        : t("pageUnread", { page: digits(page) })
                  }
                  className={`flex h-14 flex-col items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                    done
                      ? "bg-brand-600 text-white"
                      : isNext
                        ? "border-2 border-brand-600 bg-surface text-brand-700 dark:text-brand-300"
                        : "border border-border-subtle bg-surface text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  {done && <Check aria-hidden="true" className="h-3.5 w-3.5 text-brand-200" strokeWidth={3} />}
                  {isNext && !done && <span className="text-[10px] font-semibold">{t("nextShort")}</span>}
                  {digits(page)}
                </Link>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">{t("autoTick")}</p>

          {nextPage === null ? (
            <p className="rounded-xl bg-brand-50 p-3 text-center text-sm font-bold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
              {t("kahfFinished")}
            </p>
          ) : (
            <>
              <Link href={`/${academySlug}/mushaf/${nextPage}`} className="btn-primary w-full gap-2">
                <BookOpen aria-hidden="true" className="h-4 w-4" />
                {read === 0 ? t("startKahf") : t("continueFrom", { page: digits(nextPage) })}
              </Link>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  if (!key) return;
                  addKahf(key, KAHF_ALL);
                  void flush();
                }}
              >
                {t("readOnPaper")}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
