"use client";

import { useId, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";
import type {
  CircleRecitationLog,
  QueueEntry,
  RecitationKind,
  RecitationRating,
} from "@/lib/database.types";
import { ayahCount, clampAyah, isForward, type AyahRef } from "@/lib/quran/reference";
import { SURAHS, surahByNumber, type Surah } from "@/lib/quran/surahs";
import { createClient } from "@/lib/supabase/client";

/**
 * What the معلمة fills in when a student finishes reciting.
 *
 * THE GAP IT CLOSES: `recitation_status` records waiting/reciting/done, so the
 * academy knows THAT a student recited and never WHAT. For 24 of the 25
 * circles that is the substance of the session going unrecorded.
 *
 * DESIGNED FOR A LIVE CIRCLE ON A PHONE. Every field is a tap: the kind, the
 * rating and the two error counters are all chips and steppers, and only the
 * surah pickers accept typing — because 114 options is the one place a list
 * beats a wheel. A معلمة with a queue of students waiting will not fill in a
 * form that takes thirty seconds, and an empty record is worse than none.
 *
 * "من" is prefilled with the ayah after where this student stopped last time,
 * which is the commonest case by a wide margin and should cost nothing.
 *
 * WHY IT IS A SHEET AND NOT A PAGE: she is running a queue. Navigating away
 * from it and back for every student would lose her place in the list and the
 * live updates that make the list worth watching.
 */

/**
 * Everything one surah can be found by. As inclusive as it can be made,
 * because nobody types a surah the same way twice:
 *
 *   الكهف · كهف · kahf · al-kahf · 18   all reach ٱلْكَهۡفِ
 *   البقرة · بقرة · بقره · baqara · 2    all reach البَقَرَةِ
 *
 * The matcher already does partial words in any order, so what has to be
 * supplied here is the forms it cannot derive: the name with its Quranic
 * marks stripped, the same name without the definite article, and the English
 * name with its hyphens opened up (so "al kahf" and "kahf" both work in a
 * locale where the label is Arabic).
 *
 * Never shown — the option still reads in the mushaf's own orthography.
 */
function surahKeywords(surah: Surah): string {
  const withoutArticle = surah.plain.replace(/^ال/u, "");
  return [
    surah.plain,
    withoutArticle,
    surah.number,
    surah.englishName,
    surah.englishName.replace(/[-']/gu, " "),
  ].join(" ");
}

const KINDS: RecitationKind[] = ["new", "near_review", "far_review", "consolidation"];
const RATINGS: RecitationRating[] = ["excellent", "very_good", "good", "repeat"];

type RecitationLogSheetProps = {
  entry: QueueEntry;
  circleName: string;
  /** Today's log for this turn, when one was already recorded. */
  existing: CircleRecitationLog | null;
  /** Where this student stopped last time, anywhere in the academy. */
  lastEnd: AyahRef | null;
  onClose: () => void;
  /** Called after a successful save, with the row the server now holds. */
  onSaved: (log: CircleRecitationLog) => void;
};

export function RecitationLogSheet({
  entry,
  circleName,
  existing,
  lastEnd,
  onClose,
  onSaved,
}: RecitationLogSheetProps) {
  const t = useTranslations("session.log");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const fieldId = useId();

  // An existing record wins; otherwise continue from last time; otherwise the
  // opening of the mushaf, which is at least a real place rather than a blank.
  const initialFrom: AyahRef = existing
    ? { surah: existing.from_surah, ayah: existing.from_ayah }
    : lastEnd
      ? { surah: lastEnd.surah, ayah: lastEnd.ayah }
      : { surah: 1, ayah: 1 };

  const [kind, setKind] = useState<RecitationKind>(existing?.kind ?? "new");
  const [from, setFrom] = useState<AyahRef>(initialFrom);
  const [to, setTo] = useState<AyahRef>(
    existing ? { surah: existing.to_surah, ayah: existing.to_ayah } : initialFrom,
  );
  const [rating, setRating] = useState<RecitationRating | null>(
    existing?.rating ?? null,
  );
  const [major, setMajor] = useState(existing?.major_errors ?? 0);
  const [minor, setMinor] = useState(existing?.minor_errors ?? 0);
  const [note, setNote] = useState(existing?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(existing?.note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forward = isForward({ from, to });
  const count = forward ? ayahCount({ from, to }) : 0;

  const surahOptions = useMemo(
    () =>
      SURAHS.map((surah) => ({
        value: String(surah.number),
        label: locale === "ar" ? surah.name : `${surah.number}. ${surah.englishName}`,
        keywords: surahKeywords(surah),
      })),
    [locale],
  );

  async function save() {
    if (!forward) return;
    setSaving(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("record_recitation", {
      p_attendance_id: entry.attendance_id,
      p_kind: kind,
      p_from_surah: from.surah,
      p_from_ayah: from.ayah,
      p_to_surah: to.surah,
      p_to_ayah: to.ayah,
      p_rating: rating,
      p_major_errors: major,
      p_minor_errors: minor,
      p_note: note.trim() || null,
      p_finish_turn: true,
    });

    setSaving(false);

    if (rpcError) {
      console.error("record_recitation failed", rpcError);
      setError("save");
      return;
    }

    onSaved({
      attendance_id: entry.attendance_id,
      student_id: entry.student_id,
      kind,
      from_surah: from.surah,
      from_ayah: from.ayah,
      to_surah: to.surah,
      to_ayah: to.ayah,
      rating,
      major_errors: major,
      minor_errors: minor,
      note: note.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={tCommon("cancel")}
        onClick={onClose}
        className="absolute inset-0 bg-brand-950/40"
      />

      <div
        className="motion-sheet absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto
                   rounded-t-3xl bg-surface p-4 pb-6 shadow-lg sm:inset-x-auto
                   sm:end-4 sm:bottom-4 sm:top-4 sm:w-[26rem] sm:rounded-3xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-subtle sm:hidden" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold">
              {entry.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t("subtitle", { order: entry.queue_order, circle: circleName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("cancel")}
            className="shrink-0 rounded-lg border border-border-subtle p-1.5 text-muted-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Kind — four chips, wrapping. Never a dropdown: it is the first
              decision and it should be readable without opening anything. */}
          <section>
            <p className="field-label">{t("kind.label")}</p>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={kind === option}
                  className={chipClass(kind === option)}
                >
                  {t(`kind.${option}`)}
                </button>
              ))}
            </div>
          </section>

          {/* Range */}
          <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t("range.label")}</p>
              {!existing && lastEnd && (
                <span className="text-xs text-muted-foreground">
                  {t("range.continued")}
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <RefPicker
                idPrefix={`${fieldId}-from`}
                legend={t("range.from")}
                surahLabel={t("range.surah")}
                ayahLabel={t("range.ayah")}
                noMatches={tCommon("noResults")}
                options={surahOptions}
                value={from}
                onChange={(next) => {
                  setFrom(next);
                  // A "to" left behind the new "from" is never what she meant;
                  // moving it with the start is less work than an error.
                  if (!isForward({ from: next, to })) setTo(next);
                }}
              />
              <RefPicker
                idPrefix={`${fieldId}-to`}
                legend={t("range.to")}
                surahLabel={t("range.surah")}
                ayahLabel={t("range.ayah")}
                noMatches={tCommon("noResults")}
                options={surahOptions}
                value={to}
                onChange={setTo}
              />
            </div>

            <p
              className={`mt-3 border-t border-border-subtle pt-3 text-xs ${
                forward ? "text-muted-foreground" : "text-absent"
              }`}
              role={forward ? undefined : "alert"}
            >
              {forward ? t("range.count", { count }) : t("range.backwards")}
            </p>
          </section>

          {/* Rating — tappable and un-tappable: she may not want to grade
              every turn, and a required grade is how you get a meaningless
              one on every row. */}
          <section>
            <p className="field-label">{t("rating.label")}</p>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRating(rating === option ? null : option)}
                  aria-pressed={rating === option}
                  className={chipClass(rating === option)}
                >
                  {t(`rating.${option}`)}
                </button>
              ))}
            </div>
          </section>

          {/* The two error kinds, counted apart — see the migration. */}
          <section className="card p-4">
            <p className="text-sm font-semibold">{t("errors.label")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("errors.hint")}
            </p>

            <Counter
              label={t("errors.major")}
              hint={t("errors.majorHint")}
              value={major}
              onChange={setMajor}
              increaseLabel={t("errors.increase")}
              decreaseLabel={t("errors.decrease")}
            />
            <Counter
              label={t("errors.minor")}
              hint={t("errors.minorHint")}
              value={minor}
              onChange={setMinor}
              increaseLabel={t("errors.increase")}
              decreaseLabel={t("errors.decrease")}
              divided
            />
          </section>

          {/* Folded away by default: it is the one field that needs a keyboard,
              and needing a keyboard mid-circle is the exception. */}
          {noteOpen ? (
            <section>
              <label className="field-label" htmlFor={`${fieldId}-note`}>
                {t("note.label")}
              </label>
              <textarea
                id={`${fieldId}-note`}
                className="input"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("note.placeholder")}
              />
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="self-start text-sm font-semibold text-brand-700 dark:text-brand-300"
            >
              + {t("note.label")}
            </button>
          )}

          {error && (
            <p className="text-sm text-absent" role="alert">
              {t("saveError")}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !forward}
              className="btn-primary flex-grow"
            >
              {saving ? t("saving") : existing ? t("saveOnly") : t("save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One end of the range: a surah combobox and an ayah number bound to it. */
function RefPicker({
  idPrefix,
  legend,
  surahLabel,
  ayahLabel,
  noMatches,
  options,
  value,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  surahLabel: string;
  ayahLabel: string;
  noMatches: string;
  options: { value: string; label: string }[];
  value: AyahRef;
  onChange: (next: AyahRef) => void;
}) {
  const max = surahByNumber(value.surah)?.ayahs ?? 1;

  return (
    <fieldset className="rounded-xl border border-border-subtle p-3">
      <legend className="px-1 text-xs text-muted-foreground">{legend}</legend>

      <label className="sr-only" htmlFor={`${idPrefix}-surah`}>
        {surahLabel}
      </label>
      {/* Remounted on each surah change (`key`), because SearchableSelect is
          uncontrolled: its `defaultValue` is only read on mount, and "من"
          can be moved from outside — by the prefill, or by "إلى" following it. */}
      <SearchableSelect
        key={value.surah}
        id={`${idPrefix}-surah`}
        name={`${idPrefix}-surah`}
        options={options}
        defaultValue={String(value.surah)}
        noMatches={noMatches}
        onValueChange={(next) =>
          // Clamped, so moving from البقرة ٢٠٠ to الفاتحة cannot leave آية ٢٠٠
          // standing in a surah that has seven.
          onChange(clampAyah({ surah: Number(next), ayah: value.ayah }))
        }
      />

      <label className="sr-only" htmlFor={`${idPrefix}-ayah`}>
        {ayahLabel}
      </label>
      <input
        id={`${idPrefix}-ayah`}
        className="input mt-2"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value.ayah}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) return;
          onChange(clampAyah({ surah: value.surah, ayah: Math.trunc(parsed) }));
        }}
      />
    </fieldset>
  );
}

/** A −/number/+ stepper. Sized for a thumb, like the queue's reorder buttons. */
function Counter({
  label,
  hint,
  value,
  onChange,
  increaseLabel,
  decreaseLabel,
  divided,
}: {
  label: string;
  hint: string;
  value: number;
  /**
   * Takes an updater, not a number, and is handed the state setter directly.
   *
   * Counting mistakes is tapping "+" three times fast, and a handler that
   * computed `value + 1` from its own render's `value` would lose every tap
   * after the first in a batch — three taps, one mistake recorded.
   */
  onChange: React.Dispatch<React.SetStateAction<number>>;
  increaseLabel: string;
  decreaseLabel: string;
  divided?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 ${
        divided ? "border-t border-border-subtle" : "mt-2"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onChange((current) => Math.max(0, current - 1))}
          disabled={value === 0}
          aria-label={`${decreaseLabel} — ${label}`}
          className={STEPPER}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-6 text-center text-lg font-bold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange((current) => current + 1)}
          aria-label={`${increaseLabel} — ${label}`}
          className={STEPPER}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const STEPPER =
  "flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle " +
  "bg-surface text-muted-foreground transition-colors hover:border-brand-600 " +
  "hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-30 " +
  "dark:hover:text-brand-300";

/** A selectable chip. Brand fill when chosen — gold stays reserved for "now". */
function chipClass(active: boolean) {
  const base =
    "inline-flex h-10 items-center justify-center rounded-xl px-3.5 text-sm " +
    "font-semibold transition-colors focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-brand-600";

  return active
    ? `${base} bg-brand-600 text-white`
    : `${base} border border-border-subtle bg-surface text-muted-foreground hover:bg-surface-muted`;
}
