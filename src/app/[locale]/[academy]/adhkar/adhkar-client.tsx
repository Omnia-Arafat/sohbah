"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import adhkarData from "@/lib/adhkar/morning-evening.json";

/**
 * أذكار الصباح والمساء — one dhikr at a time, and it turns its own page.
 *
 * WHY ONE AT A TIME. The first version was a scrolling list of 26 cards, and
 * it read like a book: to say her أذكار she had to hold her place in a long
 * page while tapping a counter on it, with the next twenty-five in her
 * peripheral vision the whole way. One to a screen is what a مسبحة is — the
 * only thing in front of her is the dhikr she is on, and finishing it takes
 * her to the next one without her having to find it.
 *
 * WHY THE WHOLE CARD IS THE BUTTON. One of these is مائة مرة. A (+) beside the
 * text would be a small target hit a hundred times, while her eyes are on the
 * words above it. So the dhikr is the button, it is the size of the screen,
 * and it cannot be missed.
 *
 * WHAT IT REMEMBERS. Progress is per day and per period, in this browser only.
 * Half-finished أذكار الصباح survive a lock screen or a call, and are gone
 * tomorrow — nobody wants to clear yesterday's count by hand. Nothing is sent
 * anywhere: whether she said her أذكار is between her and her Lord, and not
 * something an academy should be able to look up.
 *
 * The data is imported rather than fetched, so this screen works offline from
 * the first visit. See scripts/import-adhkar.mjs for the source and why that
 * one was chosen over the fuller ones.
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

/** Long enough to see «تمّ» land, short enough not to feel like waiting. */
const ADVANCE_DELAY_MS = 550;

export function AdhkarClient() {
  const t = useTranslations("adhkar");

  const detected = useSyncExternalStore<Period | null>(
    subscribeNever,
    periodNow,
    () => null,
  );
  const [chosen, setChosen] = useState<Period | null>(null);
  const period = chosen ?? detected;

  const [edits, setEdits] = useState<Partial<Record<Period, Record<number, number>>>>({});
  /** Null until she moves herself; before that the screen picks where to open. */
  const [at, setAt] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const tapped = period === null ? {} : edits[period] ?? readProgress(period);
  const list = period === null ? [] : ALL.filter((d) => d[period]);

  const isDone = (d: Dhikr) => (tapped[d.id] ?? 0) >= d.count;
  const doneCount = list.filter(isDone).length;
  const allDone = list.length > 0 && doneCount === list.length;

  /*
    Where to open: the first one she has not finished. Coming back after a
    call should put her where she stopped, not at the top — and on a fresh
    morning that is the first dhikr anyway.
  */
  const firstUnfinished = Math.max(0, list.findIndex((d) => !isDone(d)));
  const index = Math.min(at ?? firstUnfinished, Math.max(0, list.length - 1));
  const current = list[index];

  function persist(next: Record<number, number>) {
    if (!period) return;
    setEdits((currentEdits) => ({ ...currentEdits, [period]: next }));
    try {
      window.localStorage.setItem(storageKey(period), JSON.stringify(next));
    } catch {
      // See readProgress: not worth interrupting her for.
    }
  }

  function go(to: number) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setAt(Math.max(0, Math.min(to, list.length - 1)));
    setShowDetails(false);
  }

  function tap() {
    if (!current) return;
    const said = tapped[current.id] ?? 0;
    if (said >= current.count) return;

    const next = said + 1;
    persist({ ...tapped, [current.id]: next });

    // Finished this one. Let «تمّ» show, then turn the page for her — but
    // never past the end, where the completion screen belongs.
    if (next >= current.count && index < list.length - 1) {
      advanceTimer.current = setTimeout(() => {
        setAt(index + 1);
        setShowDetails(false);
      }, ADVANCE_DELAY_MS);
    }
  }

  function switchTo(next: Period) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setChosen(next);
    setAt(null);
    setShowDetails(false);
  }

  function reset() {
    if (!period) return;
    if (!window.confirm(t("resetConfirm", { period: t(`period.${period}`) }))) return;
    persist({});
    setAt(0);
    setShowDetails(false);
  }

  // Nothing is drawn until the clock has been read on the client.
  if (period === null) return null;

  const said = current ? tapped[current.id] ?? 0 : 0;
  const remaining = current ? current.count - said : 0;
  const finished = current ? isDone(current) : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div role="tablist" className="flex flex-grow rounded-2xl bg-surface-muted p-1">
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
                     border border-border-subtle text-muted-foreground transition-colors
                     hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-300"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* A bar rather than a number alone: "٥ من ٢٦" is a fact, the bar is the
          feeling of getting through them. */}
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

      {current && (
        <>
          {/*
            The dhikr, and the button, and most of the screen. `min-h` rather
            than a fixed height: أذكار run from thirty characters to seven
            hundred, and a fixed box would either crop آية الكرسي or leave a
            short dhikr floating in emptiness.
          */}
          <button
            type="button"
            onClick={tap}
            disabled={finished}
            className={`card flex min-h-[19rem] w-full flex-col items-center justify-center
                        gap-6 px-5 py-8 text-center transition-colors
                        enabled:active:bg-surface-muted disabled:cursor-default ${
                          finished
                            ? "border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-950/40"
                            : ""
                        }`}
          >
            <p
              dir="rtl"
              lang="ar"
              className={`text-[1.2rem] leading-[2.3] ${
                finished ? "text-muted-foreground" : ""
              }`}
            >
              {current.text}
            </p>

            {finished ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("done")}
              </span>
            ) : (
              <span className="flex flex-col items-center gap-2">
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-full
                             bg-accent-500 text-3xl font-bold tabular-nums text-white shadow-md"
                >
                  {remaining}
                </span>
                <span className="text-xs text-muted-foreground">
                  {current.count > 1 ? current.countLabel : t("tapHint")}
                </span>
              </span>
            )}
          </button>

          {/*
            Order matters more than the icons here, and it is the same order
            the mushaf uses: «السابق» first, «التالي» last. In RTL the first
            child sits on the RIGHT, which puts going-back on the right and
            going-forward on the left — the direction Arabic actually moves.
            An earlier version had these the other way round and the forward
            arrow pointed left from the right-hand side, which reads as an
            arrow disagreeing with the button it is on.

            Skipping forward is deliberate: a dhikr she has already said
            elsewhere should not trap her.
          */}
          <nav className="flex items-center justify-between gap-3">
            <StepButton
              onClick={() => go(index - 1)}
              disabled={index <= 0}
              direction="prev"
              label={t("prev")}
            />
            {/* `dir="ltr"` because "1 / 24" is a fraction, not a sentence —
                left to it, bidi reorders it into "24 / 1". */}
            <span
              dir="ltr"
              className="text-sm font-semibold tabular-nums text-muted-foreground"
            >
              {index + 1} / {list.length}
            </span>
            <StepButton
              onClick={() => go(index + 1)}
              disabled={index >= list.length - 1}
              direction="next"
              label={t("next")}
            />
          </nav>

          {(current.fadl || current.source) && (
            <section className="card gap-0 overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setShowDetails((open) => !open)}
                aria-expanded={showDetails}
                className="flex w-full items-center justify-between gap-2 px-4 py-3
                           text-sm font-medium text-muted-foreground transition-colors
                           hover:bg-surface-muted"
              >
                {showDetails ? t("details.hide") : t("details.show")}
                <ChevronLeft
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${showDetails ? "-rotate-90" : ""}`}
                />
              </button>

              {showDetails && (
                <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface-muted/50 px-4 py-3">
                  {current.fadl && (
                    <p className="text-sm">
                      <span className="font-bold">{t("details.fadl")}: </span>
                      {current.fadl}
                    </p>
                  )}
                  {/* The تخريج is never hidden behind a "read more": it is the
                      reason to trust the text above it. */}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-bold">{t("details.source")}: </span>
                    {current.source}
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <p className="pb-2 text-center text-xs text-muted-foreground">{t("offline")}</p>
    </div>
  );
}

function StepButton({
  onClick,
  disabled,
  direction,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  direction: "prev" | "next";
  label: string;
}) {
  /*
    Fixed to the أذكار's own direction, not the interface language's. This
    list is read right to left whether she is on the Arabic or the English
    side, so forward is always ← and back is always →, exactly as the mushaf
    turns its pages.
  */
  const Icon = direction === "next" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-xl border
                 border-border-subtle text-muted-foreground transition-colors
                 enabled:hover:border-brand-600 enabled:hover:text-brand-700
                 disabled:opacity-30 dark:enabled:hover:text-brand-300"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
