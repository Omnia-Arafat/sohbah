"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { BookOpen, EyeOff, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { MyRecitation, QuranRangeAyah } from "@/lib/database.types";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { buildProgress } from "@/lib/quran/progress";
import { JUZ_STARTS, JUZ_COUNT } from "@/lib/quran/structure";
import { surahByNumber } from "@/lib/quran/surahs";
import { createClient } from "@/lib/supabase/client";

/**
 * اختبري حفظك — retrieval practice, not rereading.
 *
 * THE ONE FINDING THIS SCREEN IS BUILT ON: pulling something out of memory
 * beats reading it again by a wide margin — roughly 80% against 34% retained
 * after a week. So the answer is never on screen first. She recalls, then
 * reveals, then grades herself.
 *
 * NO QUESTION BANK, AND NO معلمة IN THE LOOP. Every question is generated from
 * the text itself over the range she picks, which is what makes this available
 * at any hour without anyone writing anything. Two drills are built here:
 *
 *   أكملي الآية   — the opening words are shown, the rest is covered
 *   الآية التالية — one ayah is shown, the next is covered
 *
 * The canvas also draws إخفاء الكلمات and المتشابهات. المتشابهات in particular
 * is the one worth building next — near-identical ayat in different places are
 * the hardest obstacle in serious حفظ — but it needs a similarity pass over
 * the whole text rather than a range, so it is not here yet.
 *
 * NOTHING IS TYPED. The prompt and the hidden half are the real text, split at
 * a word boundary. The split never falls inside a word, so the visible part is
 * always something she could actually have been cued with.
 */

const QUESTION_COUNT = 10;
type Mode = "complete" | "nextAyah";
type Grade = "got" | "shaky" | "lost";

type Question = {
  ayah: QuranRangeAyah;
  /** What she is shown. */
  prompt: string;
  /** What is covered until she reveals. */
  answer: string;
  /** Where the answer lives, for "open it in the mushaf". */
  answerRef: { surah: number; ayah: number; page: number };
};

export function SelfTestClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("selfTest");
  const supabase = useMemo(() => createClient(), []);
  const key = useMemo(() => meKey(academySlug), [academySlug]);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  // Her fading أجزاء, so the most useful scope can be offered by name. Absent
  // for a student who has not identified herself — which is fine: the juz
  // range below works for anyone.
  const [loadedFading, setLoadedFading] = useState<number[]>([]);

  useEffect(() => {
    // Nobody identified: there is no map to read, and `loadedFading` is
    // already the empty array it should be. Returning without a setState is
    // not just lint-appeasing — an effect that writes the value it was
    // initialised with is a render for nothing.
    if (!me) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("my_recitations", {
        p_student_id: me.studentId,
        p_phone: me.phone,
      });
      if (cancelled) return;
      if (error) {
        console.error("my_recitations failed", error);
        return;
      }
      const progress = buildProgress((data ?? []) as MyRecitation[]);
      setLoadedFading(progress.needsReview.map((cell) => cell.juz));
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, me]);

  const fading = loadedFading;

  /*
    The scope is DERIVED until she touches it, not synced by an effect.

    Her fading أجزاء arrive a moment after the page does, and the sensible
    default depends on them. Writing that default into state from an effect
    would also overwrite a choice she had already made in that moment — so
    `chosenScope` stays null until she picks, and the default is computed.
  */
  const [chosenScope, setChosenScope] = useState<"review" | "juz" | null>(null);
  const scope = chosenScope ?? (fading.length > 0 ? "review" : "juz");
  const setScope = setChosenScope;

  const [fromJuz, setFromJuz] = useState(30);
  const [toJuz, setToJuz] = useState(30);
  const [mode, setMode] = useState<Mode>("complete");

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setBusy(true);
    setError(false);

    const [from, to] =
      scope === "review" && fading.length > 0
        ? [Math.min(...fading), Math.max(...fading)]
        : [Math.min(fromJuz, toJuz), Math.max(fromJuz, toJuz)];

    const [fromSurah, fromAyah] = JUZ_STARTS[from - 1];
    const [toSurah, toAyah] =
      to < JUZ_COUNT ? previousAyah(JUZ_STARTS[to]) : [114, 6];

    const { data, error: rpcError } = await supabase.rpc("quran_range", {
      p_from_surah: fromSurah,
      p_from_ayah: fromAyah,
      p_to_surah: toSurah,
      p_to_ayah: toAyah,
    });

    setBusy(false);

    if (rpcError) {
      console.error("quran_range failed", rpcError);
      setError(true);
      return;
    }

    const ayahs = (data ?? []) as QuranRangeAyah[];
    const built = buildQuestions(ayahs, mode);
    if (built.length === 0) {
      setError(true);
      return;
    }

    setQuestions(built);
    setIndex(0);
    setRevealed(false);
    setGrades([]);
  }

  function grade(value: Grade) {
    setGrades((current) => [...current, value]);
    setRevealed(false);
    setIndex((current) => current + 1);
  }

  // ---------------------------------------------------------------- setup --

  if (!questions) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>
        </header>

        <section className="card">
          <h2 className="text-sm font-bold">{t("scope.title")}</h2>

          <div className="mt-3 flex flex-col gap-2">
            <ScopeOption
              selected={scope === "review"}
              disabled={fading.length === 0}
              onSelect={() => setScope("review")}
              title={t("scope.review")}
              hint={
                fading.length > 0
                  ? t("scope.reviewHint", {
                      list: fading
                        .map((juz) => t("scope.juzLabel", { number: juz }))
                        .join("، "),
                    })
                  : t("scope.reviewEmpty")
              }
            />

            <ScopeOption
              selected={scope === "juz"}
              onSelect={() => setScope("juz")}
              title={t("scope.juz")}
              hint={`${t("scope.juzLabel", { number: fromJuz })} ← ${t(
                "scope.juzLabel",
                { number: toJuz },
              )}`}
            />
          </div>

          {scope === "juz" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <JuzSelect
                label={t("scope.from")}
                value={fromJuz}
                onChange={setFromJuz}
                t={t}
              />
              <JuzSelect
                label={t("scope.to")}
                value={toJuz}
                onChange={setToJuz}
                t={t}
              />
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="text-sm font-bold">{t("mode.title")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            <ScopeOption
              selected={mode === "complete"}
              onSelect={() => setMode("complete")}
              title={t("mode.complete")}
              hint={t("mode.completeHint")}
            />
            <ScopeOption
              selected={mode === "nextAyah"}
              onSelect={() => setMode("nextAyah")}
              title={t("mode.nextAyah")}
              hint={t("mode.nextAyahHint")}
            />
          </div>
        </section>

        {error && (
          <p className="text-sm text-absent" role="alert">
            {t("error")}
          </p>
        )}

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? t("loading") : t("start")}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------- results --

  if (index >= questions.length) {
    const count = (value: Grade) => grades.filter((g) => g === value).length;

    return (
      <div className="flex flex-col gap-4">
        <section className="card text-center">
          <h1 className="font-display text-2xl font-bold">{t("results.title")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("results.line", {
              got: count("got"),
              shaky: count("shaky"),
              lost: count("lost"),
            })}
          </p>
        </section>

        <button
          type="button"
          onClick={() => setQuestions(null)}
          className="btn-primary w-full"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          {t("results.again")}
        </button>
        <Link href={`/${academySlug}/mushaf`} className="btn-secondary w-full">
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          {t("results.read")}
        </Link>
      </div>
    );
  }

  // ------------------------------------------------------------- question --

  const question = questions[index];
  const surah = surahByNumber(question.ayah.surah);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold">{t("title")}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("progress", { current: index + 1, total: questions.length })}
        </span>
      </header>

      <section className="rounded-2xl border border-accent-300 bg-accent-100/25 p-5 dark:border-accent-700 dark:bg-accent-700/10">
        <p className="text-xs text-accent-700 dark:text-accent-300">
          {t("ayahRef", {
            surah: (locale === "ar" ? surah?.name : surah?.englishName) ?? "",
            ayah: question.ayah.ayah,
          })}
        </p>

        <p
          dir="rtl"
          lang="ar"
          className="mt-3 text-center font-display text-[1.4rem] leading-[2.1]"
        >
          {question.prompt}
          {mode === "complete" && (
            <span className="text-muted-foreground"> …</span>
          )}
        </p>

        {!revealed ? (
          <>
            <div className="mt-4 rounded-xl border border-dashed border-accent-300 bg-accent-100/40 p-4 text-center dark:border-accent-700 dark:bg-accent-700/10">
              <EyeOff
                aria-hidden="true"
                className="mx-auto h-5 w-5 text-accent-700 dark:text-accent-300"
              />
              <p className="mt-2 text-sm leading-relaxed text-accent-700 dark:text-accent-300">
                {mode === "complete" ? t("recallPrompt") : t("recallPromptNext")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="btn-primary mt-4 w-full"
            >
              {t("reveal")}
            </button>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface p-4">
            <p className="text-xs text-muted-foreground">{t("revealed")}</p>
            <p
              dir="rtl"
              lang="ar"
              className="mt-2 text-center font-display text-[1.2rem] leading-[2.1]"
            >
              {question.answer}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => grade("got")}
                className="btn-primary px-2 py-2.5 text-sm"
              >
                {t("grade.got")}
              </button>
              <button
                type="button"
                onClick={() => grade("shaky")}
                className="btn-secondary px-2 py-2.5 text-sm"
              >
                {t("grade.shaky")}
              </button>
              <button
                type="button"
                onClick={() => grade("lost")}
                className="btn-secondary px-2 py-2.5 text-sm"
              >
                {t("grade.lost")}
              </button>
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("gradeHint")}
            </p>

            <Link
              href={`/${academySlug}/mushaf/${question.answerRef.page}`}
              className="mt-3 block text-center text-xs font-semibold text-brand-700 dark:text-brand-300"
            >
              {t("openInMushaf")}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

// =============================================================================
// Building the questions from the text
// =============================================================================

/**
 * Picks ten ayat at random from the range and splits each one.
 *
 * WHAT IS EXCLUDED, AND WHY IT MATTERS: an ayah of two or three words cannot
 * be a "complete the ayah" question — the cue would be the answer. Very short
 * ayat are common in the last أجزاء, which is exactly where a beginner tests
 * herself, so leaving them in would fill her test with questions that ask
 * nothing.
 */
function buildQuestions(ayahs: QuranRangeAyah[], mode: Mode): Question[] {
  const usable =
    mode === "complete"
      ? ayahs.filter((ayah) => wordsOf(ayah.text).length >= 6)
      : ayahs.slice(0, -1);

  const picked = sample(usable, QUESTION_COUNT);

  return picked.flatMap((ayah) => {
    if (mode === "complete") {
      const words = wordsOf(ayah.text);
      // Cue with roughly the first third, always at a word boundary and always
      // at least two words — one word is a hint, not a cue.
      const cut = Math.max(2, Math.round(words.length / 3));
      return [
        {
          ayah,
          prompt: words.slice(0, cut).join(" "),
          answer: words.slice(cut).join(" "),
          answerRef: { surah: ayah.surah, ayah: ayah.ayah, page: ayah.page },
        },
      ];
    }

    const position = ayahs.indexOf(ayah);
    const following = ayahs[position + 1];
    if (!following) return [];
    return [
      {
        ayah,
        prompt: ayah.text,
        answer: following.text,
        answerRef: {
          surah: following.surah,
          ayah: following.ayah,
          page: following.page,
        },
      },
    ];
  });
}

/**
 * Splits on whitespace only.
 *
 * Never on a mark, never normalising: every waqf sign, every ۩ and ۞, stays
 * attached to the word it belongs to and travels into whichever half it falls
 * in. The two halves joined back together are byte-for-byte the ayah.
 */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** A random sample without replacement, order shuffled. */
function sample<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const at = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }
  return picked;
}

/** The ayah before a juz boundary — where the previous juz ends. */
function previousAyah([surah, ayah]: readonly [number, number]): [number, number] {
  if (ayah > 1) return [surah, ayah - 1];
  const before = surahByNumber(surah - 1);
  return [surah - 1, before?.ayahs ?? 1];
}

// =============================================================================
// Controls
// =============================================================================

function ScopeOption({
  selected,
  disabled,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors
                  disabled:opacity-40 ${
                    selected
                      ? "border-2 border-brand-600 bg-brand-50 dark:bg-brand-950/50"
                      : "border border-border-subtle hover:bg-surface-muted"
                  }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-brand-600" : "border-border-subtle"
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function JuzSelect({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  t: ReturnType<typeof useTranslations<"selfTest">>;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: JUZ_COUNT }, (_, at) => at + 1).map((juz) => (
          <option key={juz} value={juz}>
            {t("scope.juzLabel", { number: juz })}
          </option>
        ))}
      </select>
    </label>
  );
}
