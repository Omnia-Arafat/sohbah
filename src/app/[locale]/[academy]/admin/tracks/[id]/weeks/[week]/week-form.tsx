"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BrandSelect } from "@/components/brand-select";
import { SURAHS, surahByNumber } from "@/lib/quran/surahs";
import type { DayRow } from "@/lib/track-week-dal";
import { fillWeekStarts, MEMORISE_DAYS } from "@/lib/track-week-fill";
import { saveWeek, type SaveWeekState } from "./actions";

type Draft = {
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
  review: string;
  notes: string;
};

function toDraft(day: DayRow): Draft {
  return {
    fromSurah: day.newFromSurah?.toString() ?? "",
    fromAyah: day.newFromAyah?.toString() ?? "",
    toSurah: day.newToSurah?.toString() ?? "",
    toAyah: day.newToAyah?.toString() ?? "",
    review: day.reviewText,
    notes: day.notes,
  };
}

/** Anything typed at all. Used only to mark the strip and pick the opening day. */
function isFilled(d: Draft) {
  return (
    d.fromSurah !== "" ||
    d.toSurah !== "" ||
    d.review.trim() !== "" ||
    d.notes.trim() !== ""
  );
}

/**
 * The seven days as a strip, with a dot on the ones already written.
 *
 * Small enough to sit on one phone line, so the whole week stays visible
 * while only one day's fields are.
 */
function DayStrip({
  active,
  onPick,
  filled,
  t,
}: {
  active: number;
  onPick: (i: number) => void;
  filled: boolean[];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1">
      {filled.map((isSet, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onPick(i)}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
            i === active
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-border-subtle hover:border-brand-600"
          }`}
        >
          {dayLabelFor(i, t)}
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              !isSet
                ? "bg-transparent"
                : i === active
                  ? "bg-white"
                  : "bg-brand-600 dark:bg-brand-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("weekEdit");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

export function WeekForm({
  academySlug,
  trackId,
  weekId,
  weekNumber,
  title,
  isPublished,
  days,
  continueFrom,
}: {
  academySlug: string;
  trackId: string;
  weekId: string;
  weekNumber: number;
  title: string;
  isPublished: boolean;
  days: DayRow[];
  /** Where the previous week stopped, so day one can open there. */
  continueFrom: { surah: number; ayah: number } | null;
}) {
  const t = useTranslations("weekEdit");
  const [state, formAction] = useActionState<SaveWeekState, FormData>(saveWeek, {
    status: "idle",
    error: null,
  });

  const [drafts, setDrafts] = useState<Draft[]>(() => days.map(toDraft));

  // Open on the first day still empty — the one she came to fill. A week
  // already written opens on its لقاء, where reading it starts.
  const [day, setDay] = useState(() => {
    const next = days.map(toDraft).findIndex((d) => !isFilled(d));
    return next === -1 ? 0 : next;
  });

  /*
    A rejected save names the day that failed ("code:index"). With only one
    day on screen that message could point at a card she cannot see, so the
    strip moves to it — otherwise the form reads as refusing to save for no
    visible reason.
  */
  const [lastError, setLastError] = useState(state.error);
  if (state.error !== lastError) {
    setLastError(state.error);
    const failed = Number(state.error?.split(":")[1]);
    if (Number.isInteger(failed) && failed >= 0 && failed < drafts.length) {
      setDay(failed);
    }
  }

  function set(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  /*
    THE ONE THING THAT MAKES FORTY WEEKS BEARABLE: five ends and one start
    are the whole week. The rule it follows — and why a day's start is NOT
    the previous day's end — is in src/lib/track-week-fill.ts, which is also
    what scripts/check-week-fill.mjs exercises against the real sheets.
  */
  function fillStarts() {
    setDrafts((prev) => fillWeekStarts(prev, continueFrom));
  }

  const canFill =
    continueFrom !== null ||
    Boolean(drafts[1]?.fromSurah && drafts[1]?.fromAyah);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="weekId" value={weekId} />
      <input type="hidden" name="weekNumber" value={weekNumber} />

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-absent/40 bg-absent/5 px-3 py-2.5 text-sm text-absent"
        >
          {t(`errors.${state.error.split(":")[0]}`, {
            day: dayLabelFor(Number(state.error.split(":")[1] ?? 0), t),
          })}
        </p>
      )}
      {state.status === "saved" && !state.error && (
        <p
          role="status"
          className="rounded-xl border border-present/40 bg-present/5 px-3 py-2.5 text-sm text-present"
        >
          {t("saved")}
        </p>
      )}

      <div className="card flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="title">
            {t("fields.title")}
          </label>
          <input
            id="title"
            name="title"
            dir="rtl"
            className="input"
            defaultValue={title}
            placeholder={t("fields.titlePlaceholder")}
          />
        </div>

        {/* Stated before the fields, not after: someone who reads it first
            types five numbers, someone who does not types twenty. */}
        <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t("cumulativeNote")}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={fillStarts}
            disabled={!canFill}
            className="btn-secondary min-h-11 disabled:opacity-50"
          >
            {t("fillStarts")}
          </button>
          <p className="min-w-0 flex-grow text-xs text-muted-foreground">
            {continueFrom
              ? t("continueFrom", {
                  ref: formatRef(continueFrom.surah, continueFrom.ayah),
                })
              : t("continueFromNone")}
          </p>
        </div>
      </div>

      {/*
        One day at a time. Seven stacked cards ran past 1300px on a phone,
        which is a lot of scrolling for a form whose days are filled one
        after another — and the same shape as the schedule band above it:
        the day in hand is focused, the rest are a strip to flip through.

        Every card stays MOUNTED and merely hidden, so one save still posts
        the whole week and a half-typed day is never lost by switching away.
      */}
      <DayStrip
        active={day}
        onPick={setDay}
        filled={drafts.map(isFilled)}
        t={t}
      />

      {/* The meeting day, then the five memorisation days, then Friday —
          the order the week is actually lived in. */}
      <div hidden={day !== 0}>
        <MeetingCard value={drafts[0]} onChange={(patch) => set(0, patch)} t={t} />
      </div>

      {MEMORISE_DAYS.map((i) => (
        <div key={i} hidden={day !== i}>
          <DayCard
            index={i}
            value={drafts[i]}
            onChange={(patch) => set(i, patch)}
            t={t}
          />
        </div>
      ))}

      <div hidden={day !== 6}>
        <FridayCard value={drafts[6]} onChange={(patch) => set(6, patch)} t={t} />
      </div>

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-h-11 flex-grow items-center gap-2.5">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={isPublished}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("publish")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("publishHint")}
            </span>
          </span>
        </label>
        <SubmitButton />
      </div>
    </form>
  );
}

function formatRef(surah: number, ayah: number) {
  const s = surahByNumber(surah);
  return s ? `${s.name} ${ayah}` : `${surah}:${ayah}`;
}

function dayLabelFor(i: number, t: (k: string) => string) {
  if (i === 0) return t("days.meeting");
  if (i === 6) return t("days.friday");
  return t(`days.d${i}`);
}

function SurahAyah({
  legend,
  surah,
  ayah,
  onSurah,
  onAyah,
  idPrefix,
  surahLabel,
  ayahLabel,
}: {
  legend: string;
  surah: string;
  ayah: string;
  onSurah: (v: string) => void;
  onAyah: (v: string) => void;
  idPrefix: string;
  surahLabel: string;
  ayahLabel: string;
}) {
  const max = surah ? (surahByNumber(Number(surah))?.ayahs ?? 286) : 286;
  return (
    <fieldset className="min-w-0 flex-grow">
      <legend className="field-label">{legend}</legend>
      <div className="mt-1 flex gap-2">
        <div className="min-w-0 flex-grow">
          <label className="sr-only" htmlFor={`${idPrefix}Surah`}>
            {surahLabel}
          </label>
          <BrandSelect
            id={`${idPrefix}Surah`}
            name={`${idPrefix}Surah`}
            value={surah}
            onValueChange={onSurah}
            options={[
              { value: "", label: "—" },
              ...SURAHS.map((s) => ({ value: String(s.number), label: s.name })),
            ]}
          />
        </div>
        <div className="w-24 shrink-0">
          <label className="sr-only" htmlFor={`${idPrefix}Ayah`}>
            {ayahLabel}
          </label>
          <input
            id={`${idPrefix}Ayah`}
            name={`${idPrefix}Ayah`}
            type="number"
            min={1}
            max={max}
            inputMode="numeric"
            className="input"
            value={ayah}
            onChange={(e) => onAyah(e.target.value)}
            placeholder={ayahLabel}
          />
        </div>
      </div>
    </fieldset>
  );
}

function DayCard({
  index,
  value,
  onChange,
  t,
}: {
  index: number;
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-sm font-bold">{t(`days.d${index}`)}</h2>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SurahAyah
          legend={t("fields.from")}
          surah={value.fromSurah}
          ayah={value.fromAyah}
          onSurah={(v) => onChange({ fromSurah: v })}
          onAyah={(v) => onChange({ fromAyah: v })}
          idPrefix={`d${index}_from`}
          surahLabel={t("fields.surah")}
          ayahLabel={t("fields.ayah")}
        />
        <SurahAyah
          legend={t("fields.to")}
          surah={value.toSurah}
          ayah={value.toAyah}
          onSurah={(v) => onChange({ toSurah: v })}
          onAyah={(v) => onChange({ toAyah: v })}
          idPrefix={`d${index}_to`}
          surahLabel={t("fields.surah")}
          ayahLabel={t("fields.ayah")}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`d${index}_review`}>
          {t("fields.review")}
        </label>
        <input
          id={`d${index}_review`}
          name={`d${index}_review`}
          dir="rtl"
          className="input"
          value={value.review}
          onChange={(e) => onChange({ review: e.target.value })}
          placeholder={t("fields.reviewPlaceholder")}
        />
      </div>
    </section>
  );
}

function MeetingCard({
  value,
  onChange,
  t,
}: {
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="card flex flex-col gap-3 border-brand-300 dark:border-brand-700">
      <div>
        <h2 className="text-sm font-bold">{t("days.meeting")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("meetingHint")}</p>
      </div>
      <div>
        <label className="field-label" htmlFor="d0_notes">
          {t("fields.notes")}
        </label>
        <textarea
          id="d0_notes"
          name="d0_notes"
          dir="rtl"
          rows={3}
          className="input"
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={t("fields.notesPlaceholder")}
        />
      </div>
    </section>
  );
}

function FridayCard({
  value,
  onChange,
  t,
}: {
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-bold">{t("days.friday")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("fridayHint")}</p>
      </div>
      <div>
        <label className="field-label" htmlFor="d6_review">
          {t("fields.review")}
        </label>
        <input
          id="d6_review"
          name="d6_review"
          dir="rtl"
          className="input"
          value={value.review}
          onChange={(e) => onChange({ review: e.target.value })}
          placeholder={t("fields.fridayPlaceholder")}
        />
      </div>
    </section>
  );
}
