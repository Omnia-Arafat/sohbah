"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMe, clearMe, meKey, setMe, subscribeMe, type Me } from "@/lib/me-store";
import { buildProgress, type JuzState } from "@/lib/quran/progress";
import { formatRange } from "@/lib/quran/reference";
import { createClient } from "@/lib/supabase/client";
import type {
  MyCircle,
  MyRecitation,
  RecitationRating,
  StudentSearchResult,
} from "@/lib/database.types";

export function MeClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const key = useMemo(() => meKey(academySlug), [academySlug]);

  // `useSyncExternalStore` rather than an effect: the server render and the
  // first client render both see null, and the stored value arrives without a
  // setState-in-effect.
  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  if (!me) {
    return (
      <SignIn academySlug={academySlug} onFound={(found) => setMe(key, found)} />
    );
  }

  return (
    <Record
      me={me}
      locale={locale}
      onSignOut={() => clearMe(key)}
      // Same effect as signing out, but not her doing: the identity this
      // browser held no longer resolves, so it is dropped and she is asked
      // again.
      onStale={() => clearMe(key)}
    />
  );
}

// =============================================================================
// Signing in without an account
// =============================================================================

function SignIn({
  academySlug,
  onFound,
}: {
  academySlug: string;
  onFound: (me: Me) => void;
}) {
  const t = useTranslations("me");
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"notFound" | "error" | "tooMany" | null>(null);

  /**
   * More than one student on this phone matched the name typed.
   *
   * A family shares a line here, and a mother's name often contains her
   * child's — «ام ياسين» and «ياسين طارق». Choosing for her was landing a
   * student on someone else's record, so when the answer is not unique the
   * screen asks instead of guessing.
   */
  const [choices, setChoices] = useState<StudentSearchResult[] | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("find_me", {
      p_academy_slug: academySlug,
      p_name: name,
      p_phone: phone,
    });

    setBusy(false);

    if (rpcError) {
      console.error("find_me failed", rpcError);
      setError("error");
      return;
    }

    const matches = data ?? [];

    if (matches.length === 0) {
      setError("notFound");
      return;
    }

    // Five is the function's own cap. Hitting it means the name was typed too
    // loosely to identify anybody, not that five sisters share a phone.
    if (matches.length >= 5) {
      setError("tooMany");
      return;
    }

    if (matches.length > 1) {
      setChoices(matches);
      return;
    }

    pick(matches[0]);
  }

  function pick(found: StudentSearchResult) {
    onFound({
      studentId: found.id,
      name: found.name,
      fatherName: found.father_name,
      phone,
    });
  }

  if (choices) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-2xl font-bold">
            {t("signIn.chooseTitle")}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("signIn.chooseHint")}
          </p>
        </header>

        <div className="card flex flex-col gap-2 p-3">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => pick(choice)}
              className="flex items-center gap-3 rounded-xl border border-border-subtle
                         px-4 py-3 text-start transition-colors hover:border-brand-600
                         hover:bg-surface-muted"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                           bg-brand-100 text-sm font-bold text-brand-800
                           dark:bg-brand-900 dark:text-brand-100"
              >
                {choice.name.trim().charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{choice.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {choice.father_name}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setChoices(null)}
          className="btn-secondary w-full"
        >
          {t("signIn.chooseBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <form onSubmit={submit} className="card flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("signIn.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("signIn.hint")}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="me-name">
            {t("signIn.name")}
          </label>
          <input
            id="me-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("signIn.namePlaceholder")}
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="me-phone">
            {t("signIn.phone")}
          </label>
          <input
            id="me-phone"
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("signIn.phonePlaceholder")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-absent" role="alert">
            {t(`signIn.${error}`)}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t("signIn.submitting") : t("signIn.submit")}
        </button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("signIn.privacy")}
        </p>
      </form>
    </div>
  );
}

// =============================================================================
// Her record
// =============================================================================

function Record({
  me,
  locale,
  onSignOut,
  onStale,
}: {
  me: Me;
  locale: string;
  onSignOut: () => void;
  /** The stored student no longer exists, or the phone no longer matches. */
  onStale: () => void;
}) {
  const t = useTranslations("me");
  const tLog = useTranslations("session.log");
  const supabase = useMemo(() => createClient(), []);

  /**
   * Loaded with a plain effect rather than through TanStack Query, which the
   * rest of the app uses.
   *
   * The app's query defaults (see QueryProvider) switch off every automatic
   * fetch: every list in this codebase arrives from the server with
   * `initialData` and only ever updates from a mutation or a Realtime event.
   * This page cannot arrive with server data — who the reader is lives only in
   * her own browser — so it is the one place that genuinely has to fetch on
   * mount, and bending the shared defaults for it would loosen them for every
   * screen that deliberately does not refetch.
   *
   * This is the "subscribe to something outside React" case, not the
   * state-in-effect case the rule is about.
   */
  const [entries, setEntries] = useState<MyRecitation[] | null>(null);
  const [circles, setCircles] = useState<MyCircle[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [recitations, myCircles] = await Promise.all([
        supabase.rpc("my_recitations", {
          p_student_id: me.studentId,
          p_phone: me.phone,
        }),
        supabase.rpc("my_circles", {
          p_student_id: me.studentId,
          p_phone: me.phone,
        }),
      ]);

      if (cancelled) return;

      if (recitations.error) console.error("my_recitations failed", recitations.error);
      if (myCircles.error) console.error("my_circles failed", myCircles.error);

      /*
        A stored identity that no longer resolves is forgotten rather than
        shown an empty page.

        It happens in ordinary use: a مشرفة merges two duplicate students, or
        corrects a phone number, and this browser is still holding the old id.
        Without this the page renders "لسه معلمتك ما سجّلتش تسميع ليكِ", which
        is not true and which she cannot get out of — she would have to know
        to press خروج.
      */
      const stale = [recitations.error, myCircles.error].some(
        (failure) =>
          failure?.message === "student_not_found" ||
          failure?.message === "phone_mismatch",
      );
      if (stale) {
        onStale();
        return;
      }

      setEntries((recitations.data ?? []) as MyRecitation[]);
      setCircles((myCircles.data ?? []) as MyCircle[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, me.studentId, me.phone, onStale]);

  const isPending = entries === null;
  const progress = useMemo(() => buildProgress(entries ?? []), [entries]);

  return (
    <div className="flex flex-col gap-4">
      <header className="card flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                       bg-brand-100 text-base font-bold text-brand-800
                       dark:bg-brand-900 dark:text-brand-100"
          >
            {me.name.trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{me.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {me.fatherName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 text-sm font-medium text-muted-foreground
                     transition-colors hover:text-foreground"
        >
          {t("signOut")}
        </button>
      </header>

      {/* The map. See lib/quran/progress.ts for why it is thirty cells that
          can dim rather than a bar that only fills. */}
      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{t("memorised.title")}</h2>
          <span className="text-sm text-muted-foreground">
            {progress.totalAyahs === 0
              ? t("memorised.none")
              : spanLabel(progress.totalSpan, t)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-1.5">
          {progress.cells.map((cell) => (
            <span
              key={cell.juz}
              title={`${t("memorised.juz", { number: cell.juz })} — ${Math.round(
                (cell.covered / cell.total) * 100,
              )}%`}
              className={juzCellClass(cell.state)}
            >
              {cell.juz}
            </span>
          ))}
        </div>

        <div
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border-subtle
                     pt-3 text-xs text-muted-foreground"
        >
          <LegendSwatch state="solid" label={t("memorised.legend.solid")} />
          <LegendSwatch state="fading" label={t("memorised.legend.fading")} />
          <LegendSwatch state="learning" label={t("memorised.legend.learning")} />
        </div>
      </section>

      {/* The one action the retrieval-practice research actually supports —
          and it only appears when the map has something to say. */}
      {progress.needsReview.length > 0 ? (
        <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40">
          <div className="flex items-center gap-2">
            <RotateCcw
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"
            />
            {/* One message, not a branch per count: Arabic has six plural
                forms and picking between them in TypeScript would get نصف
                منها wrong. ICU knows them — see messages/ar.json. */}
            <h2 className="font-display text-lg font-bold">
              {t("review.count", { count: progress.needsReview.length })}
            </h2>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-brand-800 dark:text-brand-200">
            {t("review.detail", {
              count: progress.needsReview.length,
              list: progress.needsReview.map((cell) => cell.juz).join("، "),
              days: Math.max(
                ...progress.needsReview.map((cell) => cell.daysSince ?? 0),
              ),
            })}
          </p>

          {/*
            The design puts «اختبري حفظك» and «اقرئي» here, and they are the
            right actions — but neither the self-test nor the mushaf exists in
            the app yet. A disabled button that never becomes enabled teaches
            people to stop reading buttons, so the card states the fact and
            stops there. The actions land with the screens they open.
          */}
        </section>
      ) : (
        progress.totalAyahs > 0 && (
          <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40">
            <h2 className="font-display text-lg font-bold">{t("review.clear")}</h2>
            <p className="mt-1 text-sm text-brand-800 dark:text-brand-200">
              {t("review.clearHint")}
            </p>
          </section>
        )
      )}

      {/* Her own record, which until now she could not see at all. */}
      <section className="card p-0">
        <h2 className="px-5 pt-5 text-base font-semibold">{t("recent.title")}</h2>

        {isPending ? (
          <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">…</p>
        ) : (entries ?? []).length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm leading-relaxed text-muted-foreground">
            {t("recent.empty")}
          </p>
        ) : (
          <ul className="mt-2">
            {(entries ?? []).slice(0, 8).map((entry, index) => (
              <li
                key={`${entry.session_date}-${index}`}
                className="flex items-center gap-3 border-t border-border-subtle px-5 py-3"
              >
                {/* The rating and kind words are read from the معلمة's own
                    namespace, where they were written for the log sheet.
                    Duplicating them here would be two lists to keep in step,
                    and a student and her معلمة must never see the same record
                    described in two different words. */}
                <span className={ratingBadgeClass(entry.rating)}>
                  {entry.rating ? tLog(`rating.${entry.rating}`) : t("recent.noRating")}
                </span>
                <div className="min-w-0 flex-grow">
                  <p className="truncate text-sm font-semibold">
                    {formatRange(
                      {
                        from: { surah: entry.from_surah, ayah: entry.from_ayah },
                        to: { surah: entry.to_surah, ayah: entry.to_ayah },
                      },
                      locale,
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tLog(`kind.${entry.kind}`)} · {lineFor(entry, t)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {whenLabel(entry.session_date, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {circles.length > 0 && (
        <section className="card p-0">
          <h2 className="px-5 pt-5 text-base font-semibold">{t("circles.title")}</h2>
          <ul className="mt-2">
            {circles.map((circle) => (
              <li
                key={circle.circle_id}
                className="border-t border-border-subtle px-5 py-3"
              >
                <Link
                  href={`/${circle.registration_slug}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {circle.circle_name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {circle.teacher_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    {t("circles.open")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
        {t("footnote")}
      </p>
    </div>
  );
}

// =============================================================================
// Presentation
// =============================================================================

type Translate = ReturnType<typeof useTranslations<"me">>;

function spanLabel(span: { juz: number; pages: number }, t: Translate) {
  if (span.juz > 0 && span.pages > 0) return t("memorised.span", span);
  if (span.juz > 0) return t("memorised.spanJuzOnly", { juz: span.juz });
  return t("memorised.spanPagesOnly", { pages: span.pages });
}

function lineFor(entry: MyRecitation, t: Translate) {
  const errors: string[] = [];
  if (entry.major_errors) {
    errors.push(t("recent.errorsMajor", { count: entry.major_errors }));
  }
  if (entry.minor_errors) {
    errors.push(t("recent.errorsMinor", { count: entry.minor_errors }));
  }
  return errors.length > 0
    ? `${entry.circle_name} · ${errors.join(" · ")}`
    : entry.circle_name;
}

function whenLabel(sessionDate: string, t: Translate) {
  const then = Date.parse(`${sessionDate}T00:00:00Z`);
  if (Number.isNaN(then)) return sessionDate;
  const now = new Date();
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - then) /
      86_400_000,
  );
  if (days <= 0) return t("recent.today");
  if (days === 1) return t("recent.yesterday");
  return t("recent.daysAgo", { days });
}

function LegendSwatch({ state, label }: { state: JuzState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-3 w-3 rounded ${swatchClass(state)}`} />
      {label}
    </span>
  );
}

/**
 * The cell tints. All brand green at four weights — no gold anywhere on this
 * page, and no red: a جزء that has gone quiet is not an error, and colouring
 * it like one would make a page about her own حفظ feel like a report card.
 */
function juzCellClass(state: JuzState) {
  const base =
    "flex h-9 items-center justify-center rounded-lg border text-xs " +
    "font-bold tabular-nums transition-colors";

  const tones: Record<JuzState, string> = {
    solid: "border-brand-600 bg-brand-600 text-white",
    fading:
      "border-dashed border-brand-400 bg-brand-100 text-brand-800 " +
      "dark:bg-brand-900 dark:text-brand-100",
    learning:
      "border-brand-500 bg-brand-50 text-brand-800 " +
      "dark:bg-brand-950 dark:text-brand-200",
    untouched:
      "border-border-subtle bg-surface-muted text-muted-foreground",
  };

  return `${base} ${tones[state]}`;
}

function swatchClass(state: JuzState) {
  const tones: Record<JuzState, string> = {
    solid: "bg-brand-600",
    fading: "border border-dashed border-brand-400 bg-brand-100 dark:bg-brand-900",
    learning: "border border-brand-500 bg-brand-50 dark:bg-brand-950",
    untouched: "border border-border-subtle bg-surface-muted",
  };
  return tones[state];
}

function ratingBadgeClass(rating: RecitationRating | null) {
  const base =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
    "text-[11px] font-bold";

  if (rating === "excellent" || rating === "very_good") {
    return `${base} bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100`;
  }
  if (rating === "repeat") {
    return `${base} bg-surface-muted text-muted-foreground`;
  }
  return `${base} bg-surface-muted text-muted-foreground`;
}
