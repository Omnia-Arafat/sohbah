"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import adhkarData from "@/lib/adhkar/morning-evening.json";

/**
 * أذكار الصباح والمساء, with the counter that makes them usable.
 *
 * WHY A COUNTER AND NOT A LIST. A list of أذكار is a page anyone can find in a
 * book; what is hard on a phone is keeping the count — «مائة مرة» for
 * لا إله إلا الله وحده لا شريك له, ثلاث مرات for the معوذات — while reading
 * from the same screen. So the dhikr IS the button: she reads it, taps it, and
 * the number comes down. Nothing else on the card competes for the thumb.
 *
 * WHAT IT REMEMBERS, AND FOR HOW LONG. Progress is kept per day and per
 * period, in this browser only. Half-finished أذكار الصباح survive the phone
 * locking, a call, or the app being closed — and are gone tomorrow, because
 * yesterday's count is not something anyone wants to clear by hand. Nothing
 * goes to a server: this is between her and her Lord, and the academy has no
 * business knowing whether she said them.
 *
 * The data is imported, not fetched, so this screen works offline from the
 * first visit — see scripts/import-adhkar.mjs for where it comes from and why
 * that source was chosen over the fuller ones.
 */

type Dhikr = {
  id: number;
  text: string;
  count: number;
  countLabel: string;
  source: string;
  morning: boolean;
  evening: boolean;
  fadl?: string;
};

const ALL = adhkarData as Dhikr[];

type Period = "morning" | "evening";

/**
 * أذكار الصباح run from الفجر until around midday, and المساء from العصر into
 * the night. Opening the app in the afternoon should not mean tapping a tab
 * first — so the clock picks, and she can still switch.
 */
function periodNow(): Period {
  return new Date().getHours() < 15 ? "morning" : "evening";
}

/** One key per day per period: yesterday's counts are never wanted. */
function storageKey(period: Period): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return `sohbah:adhkar:${day}:${period}`;
}

function readProgress(period: Period): Record<number, number> {
  try {
    const raw = window.localStorage.getItem(storageKey(period));
    return raw ? (JSON.parse(raw) as Record<number, number>) : {};
  } catch {
    // Private mode, or storage the browser will not hand over. She loses the
    // count across a reload and nothing else; the أذكار still work.
    return {};
  }
}

/** The clock, read on the client only — it never changes mid-visit. */
const subscribeNever = () => () => {};

export function AdhkarClient() {
  const t = useTranslations("adhkar");

  /*
    The period and the saved counts are both client-only facts, and neither is
    assigned from an effect. An effect would render the page once with the
    server's nothing and again with the truth — a visible flash of the wrong
    half of the day, which reads as the app choosing wrongly. The clock is
    subscribed to instead, and the counts are read straight from storage
    during render, which is cheap and gives the same answer every time.
  */
  const detected = useSyncExternalStore<Period | null>(
    subscribeNever,
    periodNow,
    () => null,
  );
  const [chosen, setChosen] = useState<Period | null>(null);
  const period = chosen ?? detected;

  /** Her taps this session, which storage has already been told about. */
  const [edits, setEdits] = useState<Partial<Record<Period, Record<number, number>>>>({});
  const [open, setOpen] = useState<number | null>(null);

  const tapped = period === null ? {} : edits[period] ?? readProgress(period);

  const list = useMemo(
    () => (period === null ? [] : ALL.filter((d) => d[period])),
    [period],
  );

  function persist(next: Record<number, number>) {
    if (!period) return;
    setEdits((current) => ({ ...current, [period]: next }));
    try {
      window.localStorage.setItem(storageKey(period), JSON.stringify(next));
    } catch {
      // See readProgress: not worth interrupting her for.
    }
  }

  function tap(dhikr: Dhikr) {
    const current = tapped[dhikr.id] ?? 0;
    if (current >= dhikr.count) return;
    persist({ ...tapped, [dhikr.id]: current + 1 });
  }

  function switchTo(next: Period) {
    setChosen(next);
    setOpen(null);
  }

  function reset() {
    if (!period) return;
    if (!window.confirm(t("resetConfirm", { period: t(`period.${period}`) }))) return;
    persist({});
  }

  const doneCount = list.filter((d) => (tapped[d.id] ?? 0) >= d.count).length;
  const allDone = list.length > 0 && doneCount === list.length;

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/* Nothing below is drawn until the clock has been read on the client. */}
      {period !== null && (
        <>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              className="flex flex-grow rounded-2xl bg-surface-muted p-1"
            >
              {(["morning", "evening"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={period === key}
                  onClick={() => switchTo(key)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                    period === key
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`tabs.${key}`)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={reset}
              aria-label={t("reset")}
              title={t("reset")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                         border border-border-subtle text-muted-foreground
                         transition-colors hover:border-brand-600 hover:text-brand-700
                         dark:hover:text-brand-300"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* A bar rather than a number alone: on a 26-item list "٥ من ٢٦" is
              a fact, and the bar is the feeling of getting through them. */}
          <div className="flex items-center gap-3">
            <div className="h-2 flex-grow overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                style={{ width: `${list.length ? (doneCount / list.length) * 100 : 0}%` }}
              />
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
              {t("progress", { done: doneCount, total: list.length })}
            </span>
          </div>

          {allDone && (
            <section className="card border-brand-300 bg-brand-50 text-center dark:border-brand-800 dark:bg-brand-950/40">
              <h2 className="text-lg font-bold">
                {t("allDone.title", { period: t(`period.${period}`) })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("allDone.body")}</p>
            </section>
          )}

          <ol className="flex flex-col gap-3">
            {list.map((dhikr) => {
              const said = tapped[dhikr.id] ?? 0;
              const finished = said >= dhikr.count;
              const remaining = dhikr.count - said;

              return (
                <li
                  key={dhikr.id}
                  className={`card gap-0 overflow-hidden p-0 transition-colors ${
                    finished
                      ? "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/40"
                      : ""
                  }`}
                >
                  {/*
                    The whole dhikr is the tap target. A small (+) button beside
                    it would be a 40px target next to 700 characters of text she
                    is already looking at, and she is tapping this a hundred
                    times for one of them.
                  */}
                  <button
                    type="button"
                    onClick={() => tap(dhikr)}
                    disabled={finished}
                    className="w-full px-4 py-4 text-start transition-colors
                               enabled:hover:bg-surface-muted/60 disabled:cursor-default"
                  >
                    <p
                      dir="rtl"
                      lang="ar"
                      className={`text-[1.12rem] leading-[2.15] ${
                        finished ? "text-muted-foreground" : ""
                      }`}
                    >
                      {dhikr.text}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {dhikr.countLabel}
                      </span>

                      {finished ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("done")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {dhikr.count > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {t("remaining", { count: remaining })}
                            </span>
                          )}
                          <span
                            className="flex h-10 w-10 items-center justify-center rounded-full
                                       bg-accent-500 text-base font-bold tabular-nums text-white shadow-sm"
                          >
                            {remaining}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>

                  {(dhikr.fadl || dhikr.source) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen(open === dhikr.id ? null : dhikr.id)}
                        aria-expanded={open === dhikr.id}
                        className="flex w-full items-center justify-between gap-2 border-t
                                   border-border-subtle px-4 py-2.5 text-xs font-medium
                                   text-muted-foreground transition-colors hover:bg-surface-muted"
                      >
                        {open === dhikr.id ? t("details.hide") : t("details.show")}
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-4 w-4 transition-transform ${
                            open === dhikr.id ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {open === dhikr.id && (
                        <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface-muted/50 px-4 py-3">
                          {dhikr.fadl && (
                            <p className="text-sm">
                              <span className="font-bold">{t("details.fadl")}: </span>
                              {dhikr.fadl}
                            </p>
                          )}
                          {/* The تخريج is never hidden behind a "read more":
                              it is the reason to trust the text above it. */}
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="font-bold">{t("details.source")}: </span>
                            {dhikr.source}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          <p className="pb-2 text-center text-xs text-muted-foreground">{t("offline")}</p>
        </>
      )}
    </div>
  );
}
