"use client";

import { useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, CircleCheckBig, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { reviewQueue } from "@/components/student-record";
import { JUZ_NAMES } from "@/lib/quran/juz-names";
import type { JuzCell, JuzState } from "@/lib/quran/progress";
import { pageOf } from "@/lib/quran/reference";
import { JUZ_STARTS } from "@/lib/quran/structure";
import { useMyRecord } from "@/lib/use-my-record";

/*
  The ring's tints. Brand green at four weights and no gold: gold means
  "happening now" in this app, and a جزء gone quiet is not an error either —
  the same rule the old grid on صفحتي kept. Each state also differs in
  lightness or in outline, so it does not rest on hue alone.
*/
const RING: Record<JuzState, { fill: string; stroke: string; dash?: string }> = {
  solid: { fill: "#75c0a0", stroke: "none" },
  fading: { fill: "rgba(117,192,160,0.28)", stroke: "#75c0a0", dash: "4 3" },
  learning: { fill: "rgba(255,255,255,0.04)", stroke: "#d3ece0" },
  untouched: { fill: "rgba(255,255,255,0.10)", stroke: "none" },
};

const CENTRE = 150;
const OUTER = 142;
const INNER = 106;

function point(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return `${(CENTRE + radius * Math.cos(angle)).toFixed(2)} ${(CENTRE + radius * Math.sin(angle)).toFixed(2)}`;
}

/** Juz 1 at the top, then on counter-clockwise — the way the page reads. */
function segmentPath(index: number) {
  const start = -90 - index * 12 - 0.9;
  const end = start - 10.2;
  return [
    `M ${point(OUTER, start)}`,
    `A ${OUTER} ${OUTER} 0 0 0 ${point(OUTER, end)}`,
    `L ${point(INNER, end)}`,
    `A ${INNER} ${INNER} 0 0 1 ${point(INNER, start)}`,
    "Z",
  ].join(" ");
}

function firstFocus(cells: JuzCell[], queue: JuzCell[]) {
  return (
    queue[0]?.juz ??
    cells.find((cell) => cell.state === "learning")?.juz ??
    cells.find((cell) => cell.state === "solid")?.juz ??
    1
  );
}

export function HifzClient({ academySlug }: { academySlug: string }) {
  const t = useTranslations("studentHome.hifzPage");
  const { me, progress } = useMyRecord(academySlug);
  const [picked, setPicked] = useState<number | null>(null);

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        <Link href={`/${academySlug}`} className="font-bold text-brand-700 dark:text-brand-300">
          {t("back")}
        </Link>
      </p>
    );
  }

  const cells = progress?.cells ?? [];
  const queue = progress ? reviewQueue(progress) : [];
  const solid = cells.filter((cell) => cell.state === "solid").length;
  const focus = picked ?? (progress ? firstFocus(cells, queue) : 1);
  const cell = cells[focus - 1];
  const state: JuzState = cell?.state ?? "untouched";
  const [startSurah, startAyah] = JUZ_STARTS[focus - 1];
  const mushafPage = pageOf({ surah: startSurah, ayah: startAyah });

  const step = (by: number) => setPicked(((focus - 1 + by + 30) % 30) + 1);

  return (
    <div className="-mx-4 -mt-8 flex flex-col">
      <section className="flex flex-col items-center gap-3.5 bg-brand-950 px-4 pb-8 pt-3 text-white">
        <Link
          href={`/${academySlug}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-brand-200"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
          {t("back")}
        </Link>

        <div className="flex flex-col items-center gap-0.5 text-center">
          <h1 className="font-display text-3xl font-bold">{t("title")}</h1>
          <p className="text-sm text-brand-100">
            {progress ? (
              <>
                {t("summary", { solid })}
                {queue.length > 0 && <> · {t("dueCount", { count: queue.length })}</>}
              </>
            ) : (
              "…"
            )}
          </p>
        </div>

        <div className="relative h-[300px] w-[300px] max-w-full">
          <svg viewBox="0 0 300 300" className="h-full w-full" role="img" aria-label={t("mapLabel")}>
            {Array.from({ length: 30 }, (_, index) => {
              const juz = index + 1;
              const tone = RING[cells[index]?.state ?? "untouched"];
              const selected = juz === focus;
              return (
                <path
                  key={juz}
                  d={segmentPath(index)}
                  fill={tone.fill}
                  stroke={selected ? "#ffffff" : tone.stroke}
                  strokeWidth={selected ? 3 : 1.5}
                  strokeDasharray={selected ? undefined : tone.dash}
                  onClick={() => setPicked(juz)}
                  className="cursor-pointer"
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-[62px] flex flex-col items-center justify-center gap-0.5 text-center">
            <span className="text-xs text-brand-200">{t("juz")}</span>
            <span className="font-display text-6xl font-bold leading-none text-brand-300">{focus}</span>
            <span className="font-display text-lg">{JUZ_NAMES[focus - 1]}</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-brand-100">
          {(["solid", "fading", "learning", "untouched"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                <rect
                  x="0.75"
                  y="0.75"
                  width="10.5"
                  height="10.5"
                  rx="2.5"
                  fill={RING[key].fill}
                  stroke={RING[key].stroke === "none" ? "transparent" : RING[key].stroke}
                  strokeDasharray={RING[key].dash}
                  strokeWidth="1.5"
                />
              </svg>
              {t(`state.${key}`)}
            </span>
          ))}
        </div>
      </section>

      <div className="-mt-4 flex flex-col gap-4 px-4">
        <section className="card flex flex-col gap-3.5 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("prev")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5 ltr:rotate-180" />
            </button>
            <div className="flex min-w-0 flex-col items-center gap-1 text-center">
              <h2 className="font-display text-xl font-bold">
                {t("juzTitle", { juz: focus, name: JUZ_NAMES[focus - 1] })}
              </h2>
              <span className={stateChipClass(state)}>{t(`state.${state}`)}</span>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("next")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5 ltr:rotate-180" />
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {state === "solid" || state === "fading"
              ? t(`line.${state}`, { days: cell?.daysSince ?? 0 })
              : t(`line.${state}`)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/${academySlug}/self-test`} prefetch={false} className="btn-primary min-h-11 gap-1.5 whitespace-nowrap rounded-xl px-3 py-0 text-sm">
              <CircleCheckBig aria-hidden="true" className="h-4 w-4" />
              {t("test")}
            </Link>
            <Link
              href={`/${academySlug}/mushaf/${mushafPage}`}
              prefetch={false}
              className="btn-secondary min-h-11 gap-1.5 whitespace-nowrap rounded-xl px-3 py-0 text-sm"
            >
              <BookOpen aria-hidden="true" className="h-4 w-4" />
              {t("read")}
            </Link>
          </div>
        </section>

        <section className="card flex flex-col gap-2.5 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <RotateCcw aria-hidden="true" className="h-[18px] w-[18px] text-brand-700 dark:text-brand-300" />
            {t("queue")}
          </h2>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">{progress ? t("queueEmpty") : "…"}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {queue.map((due) => (
                  <button
                    key={due.juz}
                    type="button"
                    onClick={() => setPicked(due.juz)}
                    aria-pressed={due.juz === focus}
                    className={`min-h-11 rounded-xl border px-3.5 text-sm font-bold transition-colors ${
                      due.juz === focus
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-brand-200 bg-surface text-brand-800 dark:border-brand-800 dark:text-brand-200"
                    }`}
                  >
                    {t("queueItem", { juz: due.juz, days: due.daysSince ?? 0 })}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("queueNote")}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function stateChipClass(state: JuzState) {
  const base = "rounded-full px-3 py-0.5 text-xs font-bold";
  if (state === "solid") return `${base} bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100`;
  if (state === "fading") return `${base} border border-dashed border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200`;
  if (state === "learning") return `${base} border border-brand-500 text-brand-800 dark:text-brand-200`;
  return `${base} bg-surface-muted text-muted-foreground`;
}
