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
import type {
  MushafAyah,
  MutashabihQuestion,
  MyRecitation,
  QuranRangeAyah,
} from "@/lib/database.types";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { buildProgress } from "@/lib/quran/progress";
import { pageOf } from "@/lib/quran/reference";
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
 * NO QUESTION BANK, AND NO معلمة IN THE LOOP. Every question comes from the
 * text itself, which is what makes this available at any hour without anyone
 * writing anything. Three drills:
 *
 *   أكملي الآية   — the opening words are shown, the rest is covered
 *   الآية التالية — one ayah is shown, the next is covered
 *   المتشابهات    — a near-identical pair, and the word they part on
 *   إخفاء الكلمات — a mushaf page with more of it covered each time
 *
 * The first two are recall-and-self-grade: there is no way to check what she
 * said out loud, and asking her to TYPE an ayah would be asking her to type
 * scripture. المتشابهات is different — it has a right answer and is marked,
 * because the failure it trains is confident wrongness and self-grading would
 * grade the confidence.

 *
 * NOTHING IS TYPED. The prompt and the hidden half are the real text, split at
 * a word boundary. The split never falls inside a word, so the visible part is
 * always something she could actually have been cued with.
 */

const QUESTION_COUNT = 10;

/**
 * إخفاء الكلمات hides this share of each page, ramping across the run.
 *
 * It starts gentle enough to be readable — a quarter covered still leaves the
 * shape of the page — and ends where she is reciting most of it from memory
 * with the page as a prompt rather than a text. Five pages, not ten: a page is
 * a long piece of work next to a single ayah.
 */
const HIDDEN_PAGES = 5;
const HIDDEN_FROM = 0.25;
const HIDDEN_TO = 0.6;

type Mode = "complete" | "nextAyah" | "mutashabihat" | "hidden";
type Grade = "got" | "shaky" | "lost";

/**
 * A recall question: she is shown a cue, recites the rest to herself, reveals,
 * and grades her own answer. There is no objective mark because there is no
 * way to check what she said out loud — and asking her to type an ayah would
 * be asking her to type scripture.
 */
type RecallQuestion = {
  kind: "recall";
  ayah: QuranRangeAyah;
  /** What she is shown. */
  prompt: string;
  /** What is covered until she reveals. */
  answer: string;
  /** Where the answer lives, for "open it in the mushaf". */
  answerRef: { surah: number; ayah: number; page: number };
};

/**
 * A المتشابهات question: one word of a known ayah is blanked, and the two
 * candidates are the word that really belongs there and the word from its
 * near-twin elsewhere in the mushaf.
 *
 * This one DOES have a right answer, so it is marked rather than self-graded.
 * That is the difference the drill needs: the whole failure being trained is
 * confident wrongness, and a student grading herself on it would grade the
 * confidence.
 */
type ChoiceQuestion = {
  kind: "choice";
  surah: number;
  ayah: number;
  page: number;
  /** The ayah's words, verbatim, with `blankAt` to be covered. */
  words: string[];
  blankAt: number;
  correct: string;
  /** The correct and the decoy, already shuffled. */
  options: string[];
  /** Where the decoy comes from, revealed after she answers. */
  twin: { surah: number; ayah: number };
};

/**
 * إخفاء الكلمات — a mushaf page with a share of its words covered, and more
 * covered on each question than the last.
 *
 * The page is the unit because that is how the drill is done on paper: a
 * حافظة lays a card over part of the page and reads through it. Doing it to a
 * single ayah would be the same exercise as أكملي الآية, and doing it to a
 * reflowing list would destroy the page layout the memory is hung on.
 */
type HiddenPageQuestion = {
  kind: "hidden";
  page: number;
  surah: number;
  /** The page's ayat, each already split into verbatim words. */
  lines: { surah: number; ayah: number; words: string[] }[];
  /** Which words are covered, as "lineIndex:wordIndex". */
  hidden: Set<string>;
};

type Question = RecallQuestion | ChoiceQuestion | HiddenPageQuestion;

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

    // المتشابهات is asked from a precomputed table rather than from the text,
    // because finding a near-twin means comparing an ayah with every other in
    // the mushaf — not something to do while she waits.
    if (mode === "mutashabihat") {
      const { data, error: rpcError } = await supabase.rpc("mutashabihat_questions", {
        p_from_juz: from,
        p_to_juz: to,
        p_limit: QUESTION_COUNT,
      });

      setBusy(false);

      if (rpcError) {
        console.error("mutashabihat_questions failed", rpcError);
        setError(true);
        return;
      }

      const built = buildChoiceQuestions((data ?? []) as MutashabihQuestion[]);
      if (built.length === 0) {
        setError(true);
        return;
      }

      setQuestions(built);
      setIndex(0);
      setRevealed(false);
      setGrades([]);
      return;
    }

    // إخفاء الكلمات works a page at a time, so it asks for pages rather than a
    // range of ayat. The page numbers come from the juz boundaries through the
    // generated structure table — no extra round trip to find out which pages
    // a جزء covers.
    if (mode === "hidden") {
      const firstPage = pageOf(refOf(JUZ_STARTS[from - 1]));
      const lastPage = pageOf(
        to < JUZ_COUNT ? refOf(previousAyah(JUZ_STARTS[to])) : { surah: 114, ayah: 6 },
      );

      const pages = samplePages(firstPage, lastPage, HIDDEN_PAGES);
      const loaded = await Promise.all(
        pages.map((page) => supabase.rpc("mushaf_page", { p_page: page })),
      );

      setBusy(false);

      const failed = loaded.find((result) => result.error);
      if (failed) {
        console.error("mushaf_page failed", failed.error);
        setError(true);
        return;
      }

      const built = pages.flatMap((page, at) =>
        buildHiddenPage(page, (loaded[at].data ?? []) as MushafAyah[], at),
      );
      if (built.length === 0) {
        setError(true);
        return;
      }

      setQuestions(built);
      setIndex(0);
      setRevealed(false);
      setGrades([]);
      return;
    }

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
            <ScopeOption
              selected={mode === "mutashabihat"}
              onSelect={() => setMode("mutashabihat")}
              title={t("mode.mutashabihat")}
              hint={t("mode.mutashabihatHint")}
            />
            <ScopeOption
              selected={mode === "hidden"}
              onSelect={() => setMode("hidden")}
              title={t("mode.hidden")}
              hint={t("mode.hiddenHint")}
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
          {/* A marked drill does not get the self-grading words. "٧ نسيتيها"
              is what a student says about her own recall; a multiple-choice
              miss is just wrong, and calling it forgetting overstates it. */}
          <p className="mt-2 text-muted-foreground">
            {mode === "mutashabihat"
              ? t("results.marked", {
                  right: count("got"),
                  total: questions.length,
                })
              : t("results.line", {
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
  const surahNumber =
    question.kind === "recall" ? question.ayah.surah : question.surah;
  const surah = surahByNumber(surahNumber);
  const surahLabel = (locale === "ar" ? surah?.name : surah?.englishName) ?? "";
  const progressLabel = t("progress", {
    current: index + 1,
    total: questions.length,
  });

  if (question.kind === "choice") {
    return (
      <MutashabihQuestionCard
        question={question}
        surahLabel={surahLabel}
        academySlug={academySlug}
        progress={progressLabel}
        onAnswered={(right) => grade(right ? "got" : "lost")}
        t={t}
      />
    );
  }

  if (question.kind === "hidden") {
    return (
      <HiddenPageCard
        question={question}
        surahLabel={surahLabel}
        academySlug={academySlug}
        progress={progressLabel}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onGrade={grade}
        t={t}
      />
    );
  }

  const ayahNumber = question.ayah.ayah;

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
            ayah: ayahNumber,
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
/**
 * Turns each pair into one question: the ayah with its distinguishing word
 * covered, and the two candidates shuffled.
 *
 * The blank is drawn over `a_word_index`, which the generator computed on a
 * token list with the standalone waqf signs removed from BOTH the real and the
 * folded form together — so the same filtering has to happen here, or the
 * blank lands on a pause mark. That is the one detail this function has to get
 * right and it is why it splits the same way the generator did.
 */
function buildChoiceQuestions(rows: MutashabihQuestion[]): ChoiceQuestion[] {
  const MARKS_ONLY = /^[ؐ-ًؚ-ٰٟۖ-ۭـ]+$/u;

  return rows.flatMap((row) => {
    const words = row.a_text
      .split(/\s+/)
      .filter((token) => token && !MARKS_ONLY.test(token));

    if (row.a_word_index >= words.length) return [];
    // The stored word must still be the word at that index. If it is not, the
    // two sides have drifted and the question would be drawn over something
    // else — drop it rather than ask it.
    if (words[row.a_word_index] !== row.a_word) return [];

    return [
      {
        kind: "choice" as const,
        surah: row.a_surah,
        ayah: row.a_ayah,
        page: row.a_page,
        words,
        blankAt: row.a_word_index,
        correct: row.a_word,
        options: Math.random() < 0.5
          ? [row.a_word, row.b_word]
          : [row.b_word, row.a_word],
        twin: { surah: row.b_surah, ayah: row.b_ayah },
      },
    ];
  });
}

function buildQuestions(ayahs: QuranRangeAyah[], mode: Mode): RecallQuestion[] {
  const usable =
    mode === "complete"
      ? ayahs.filter(
          (ayah) =>
            wordsOf(ayah.text).length >= 6 &&
            // The first ayah of a surah opens with the البسملة in this
            // edition, so its opening third IS the البسملة — a cue that is
            // identical for 112 surahs and tells her nothing about which one
            // she is being asked for. Excluded rather than trimmed: trimming
            // would mean deciding where scripture ends and a prefix begins,
            // and that is not a decision this app gets to make.
            !(ayah.ayah === 1 && ayah.surah !== 9),
        )
      : ayahs.slice(0, -1);

  const picked = sample(usable, QUESTION_COUNT);

  return picked.flatMap((ayah) => {
    if (mode === "nextAyah") {
      const position = ayahs.indexOf(ayah);
      const following = ayahs[position + 1];
      if (!following) return [];
      return [
        {
          kind: "recall" as const,
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
    }

    const words = wordsOf(ayah.text);
    // Cue with roughly the first third, always at a word boundary and always
    // at least two words — one word is a hint, not a cue.
    const cut = Math.max(2, Math.round(words.length / 3));
    return [
      {
        kind: "recall" as const,
        ayah,
        prompt: words.slice(0, cut).join(" "),
        answer: words.slice(cut).join(" "),
        answerRef: { surah: ayah.surah, ayah: ayah.ayah, page: ayah.page },
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

/**
 * One المتشابهات question.
 *
 * The ayah is shown with its distinguishing word covered, and the two
 * candidates are the word that belongs there and the word its near-twin has in
 * the same place. She picks; the screen marks it and says where the other one
 * lives, because knowing WHICH ayah she confused it with is most of the fix.
 *
 * Marked rather than self-graded, unlike the other two drills: there is a right
 * answer here, and the failure being trained is confident wrongness — a student
 * grading herself on it would grade her confidence.
 */
function MutashabihQuestionCard({
  question,
  surahLabel,
  academySlug,
  progress,
  onAnswered,
  t,
}: {
  question: ChoiceQuestion;
  surahLabel: string;
  academySlug: string;
  progress: string;
  onAnswered: (right: boolean) => void;
  t: ReturnType<typeof useTranslations<"selfTest">>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const twinSurah = surahByNumber(question.twin.surah);
  const right = picked === question.correct;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold">{t("title")}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">{progress}</span>
      </header>

      <section className="rounded-2xl border border-accent-300 bg-accent-100/25 p-5 dark:border-accent-700 dark:bg-accent-700/10">
        <p className="text-xs text-accent-700 dark:text-accent-300">
          {t("ayahRef", { surah: surahLabel, ayah: question.ayah })}
        </p>

        <p
          dir="rtl"
          lang="ar"
          className="mt-3 text-center font-display text-[1.35rem] leading-[2.2]"
        >
          {question.words.map((word, at) =>
            at === question.blankAt ? (
              <span
                key={at}
                className={
                  picked === null
                    ? "mx-1 inline-block min-w-20 rounded-lg border-b-2 border-dashed border-accent-500 align-middle"
                    : `mx-1 inline-block rounded-lg px-2 ${
                        right
                          ? "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                          : "bg-surface-muted text-foreground"
                      }`
                }
              >
                {/* Before she answers: a rule, never a guess at the word. After:
                    the real one, whatever she picked — the point is to leave her
                    looking at the correct ayah, not at her own mistake. */}
                {picked === null ? "\u00A0" : question.correct}
              </span>
            ) : (
              <span key={at}>{word} </span>
            ),
          )}
        </p>

        {picked === null ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPicked(option)}
                dir="rtl"
                lang="ar"
                className="rounded-xl border-2 border-border-subtle bg-surface px-3 py-3
                           font-display text-lg transition-colors hover:border-brand-600
                           focus-visible:outline-2 focus-visible:outline-offset-2
                           focus-visible:outline-brand-600"
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border-subtle bg-surface p-4">
            <p
              className={`text-center text-base font-bold ${
                right
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-accent-700 dark:text-accent-300"
              }`}
            >
              {right ? t("mutashabihat.right") : t("mutashabihat.wrong")}
            </p>

            {/* Naming the twin is the lesson. "You confused it with الأعراف
                ١٤١" is what she can act on; "wrong" on its own is not. */}
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              {t("mutashabihat.twin", {
                surah: twinSurah?.name ?? "",
                ayah: question.twin.ayah,
              })}
            </p>

            <button
              type="button"
              onClick={() => onAnswered(right)}
              className="btn-primary mt-4 w-full"
            >
              {t("next")}
            </button>

            <Link
              href={`/${academySlug}/mushaf/${question.page}`}
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
// إخفاء الكلمات
// =============================================================================

/** `[surah, ayah]` from the structure tables, as the shape the helpers take. */
function refOf([surah, ayah]: readonly [number, number]) {
  return { surah, ayah };
}

/** Distinct pages from a range, in reading order — the drill moves forward. */
function samplePages(first: number, last: number, count: number): number[] {
  const span = Math.max(1, last - first + 1);
  const wanted = Math.min(count, span);
  const picked = new Set<number>();
  while (picked.size < wanted) {
    picked.add(first + Math.floor(Math.random() * span));
  }
  return [...picked].sort((a, b) => a - b);
}

/**
 * Covers a share of the page's words, more on each successive page.
 *
 * WHAT IS NEVER HIDDEN: the first word of an ayah. It is the cue the whole
 * page hangs on — a حافظة finds her place by the openings, and covering them
 * turns a memory drill into a guessing game. Everything after it is fair.
 *
 * The words themselves are the verbatim tokens; nothing is rewritten, and a
 * covered word is covered in the DOM rather than replaced, so revealing it
 * shows the real text and not a reconstruction.
 */
function buildHiddenPage(
  page: number,
  ayahs: MushafAyah[],
  order: number,
): HiddenPageQuestion[] {
  if (ayahs.length === 0) return [];

  const lines = ayahs.map((entry) => ({
    surah: entry.surah,
    ayah: entry.ayah,
    words: entry.text.split(/\s+/).filter(Boolean),
  }));

  // Every position that may be covered: not the opening word of an ayah.
  const candidates: string[] = [];
  lines.forEach((line, lineAt) => {
    line.words.forEach((_, wordAt) => {
      if (wordAt === 0) return;
      candidates.push(`${lineAt}:${wordAt}`);
    });
  });

  const step = HIDDEN_PAGES > 1 ? order / (HIDDEN_PAGES - 1) : 0;
  const share = HIDDEN_FROM + (HIDDEN_TO - HIDDEN_FROM) * step;
  const hidden = new Set(sample(candidates, Math.round(candidates.length * share)));

  return [{ kind: "hidden", page, surah: ayahs[0].surah, lines, hidden }];
}

/**
 * One page with words covered.
 *
 * A covered word can be tapped on its own. That is not a convenience — it is
 * how the drill is done on paper: you lift the card off one word, not the
 * whole page, and the point is to get unstuck without giving up the rest.
 * «اكشفي الصفحة» is the give-up, and it is the one that ends the question.
 */
function HiddenPageCard({
  question,
  surahLabel,
  academySlug,
  progress,
  revealed,
  onReveal,
  onGrade,
  t,
}: {
  question: HiddenPageQuestion;
  surahLabel: string;
  academySlug: string;
  progress: string;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
  t: ReturnType<typeof useTranslations<"selfTest">>;
}) {
  const [peeked, setPeeked] = useState<Set<string>>(new Set());

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold">{t("title")}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">{progress}</span>
      </header>

      <section className="rounded-2xl border border-accent-300 bg-accent-100/25 p-1.5 dark:border-accent-700 dark:bg-accent-700/10">
        <div className="rounded-xl border border-accent-200 px-3 py-4 dark:border-accent-700/60">
          <p className="pb-2 text-center text-xs text-accent-700 dark:text-accent-300">
            {t("hidden.pageLabel", { page: question.page, surah: surahLabel })}
          </p>

          <p
            dir="rtl"
            lang="ar"
            className="text-center font-display text-[1.25rem] leading-[2.4]"
          >
            {question.lines.map((line, lineAt) => (
              <span key={`${line.surah}:${line.ayah}`}>
                {line.words.map((word, wordAt) => {
                  const at = `${lineAt}:${wordAt}`;
                  const covered =
                    question.hidden.has(at) && !revealed && !peeked.has(at);

                  if (!covered) return <span key={at}>{word} </span>;

                  return (
                    <button
                      key={at}
                      type="button"
                      onClick={() =>
                        setPeeked((current) => new Set(current).add(at))
                      }
                      aria-label={t("hidden.tapHint")}
                      className="mx-0.5 inline-block h-5 rounded bg-accent-200/80 align-middle
                                 dark:bg-accent-700/40"
                      // Sized to the word it covers, so the line keeps its
                      // rhythm and she can still see how long the word is —
                      // which is a legitimate part of the cue on paper too.
                      style={{ width: `${Math.max(2, word.length * 0.55)}ch` }}
                    />
                  );
                })}
                <span className="mx-1 inline-block align-middle text-xs text-accent-600 dark:text-accent-400">
                  ﴿{toArabicDigits(line.ayah)}﴾
                </span>{" "}
              </span>
            ))}
          </p>
        </div>
      </section>

      {!revealed ? (
        <>
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            {t("hidden.instruction")}
            <br />
            <span className="text-xs">{t("hidden.tapHint")}</span>
          </p>
          <button type="button" onClick={onReveal} className="btn-primary w-full">
            {t("hidden.revealAll")}
          </button>
        </>
      ) : (
        <div className="card">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onGrade("got")}
              className="btn-primary px-2 py-2.5 text-sm"
            >
              {t("grade.got")}
            </button>
            <button
              type="button"
              onClick={() => onGrade("shaky")}
              className="btn-secondary px-2 py-2.5 text-sm"
            >
              {t("grade.shaky")}
            </button>
            <button
              type="button"
              onClick={() => onGrade("lost")}
              className="btn-secondary px-2 py-2.5 text-sm"
            >
              {t("grade.lost")}
            </button>
          </div>
          <Link
            href={`/${academySlug}/mushaf/${question.page}`}
            className="mt-3 block text-center text-xs font-semibold text-brand-700 dark:text-brand-300"
          >
            {t("openInMushaf")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Ayah numbers are Arabic-Indic inside the ۝, as on the page itself. */
function toArabicDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) =>
    String.fromCharCode(0x0660 + Number(digit)),
  );
}
