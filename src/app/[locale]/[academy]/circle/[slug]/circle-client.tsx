"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { QueueEntry, StudentSearchResult } from "@/lib/database.types";
import {
  getJoined,
  joinedKey,
  setJoined,
  subscribeJoined,
} from "@/lib/joined-store";
import { createClient } from "@/lib/supabase/client";

type CircleClientProps = {
  academySlug: string;
  slug: string;
  sessionDate: string;
  sessionLink: string;
  initialQueue: QueueEntry[];
};

type SearchResults = { query: string; items: StudentSearchResult[] };

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const MOTION_MS = 480;

function MotionSection({
  show,
  children,
  className = "",
  delay = 0,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!mounted) return null;

  return (
    <section
      className={`motion-section ${visible ? "" : "motion-section-hidden"} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </section>
  );
}

export function CircleClient({
  academySlug,
  slug,
  sessionDate,
  sessionLink,
  initialQueue,
}: CircleClientProps) {
  const t = useTranslations("circle");
  const supabase = useMemo(() => createClient(), []);
  const storageKey = joinedKey(slug, sessionDate);
  const sessionRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  /**
   * Seeded from the server render and then left alone — see `refreshQueue`.
   */
  const queueKey = useMemo(() => ["circle-queue", slug] as const, [slug]);
  const queryClient = useQueryClient();
  const { data: queue = [] } = useQuery({
    queryKey: queueKey,
    queryFn: async () => {
      const { data, error: queueError } = await supabase.rpc("circle_queue", {
        p_slug: slug,
      });
      if (queueError) throw queueError;
      return (data ?? []) as QueueEntry[];
    },
    initialData: initialQueue,
  });

  const setQueue = useCallback(
    (next: QueueEntry[]) => queryClient.setQueryData(queueKey, next),
    [queryClient, queueKey],
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const joined = useSyncExternalStore(
    subscribeJoined,
    () => getJoined(storageKey),
    () => null,
  );

  /**
   * Refetches the queue on demand. Called after *this* student joins, so they
   * see their own place in the order straight away.
   *
   * Nothing calls it on a timer or a Realtime event: the query defaults (see
   * `QueryProvider`) disable background refetching, so students who join later
   * appear only when the page is refreshed.
   */
  const refreshQueue = useCallback(async () => {
    const { data, error: queueError } = await supabase.rpc("circle_queue", {
      p_slug: slug,
    });
    if (!queueError && data) setQueue(data as QueueEntry[]);
  }, [supabase, slug, setQueue]);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error: searchError } = await supabase.rpc("search_students", {
        p_slug: slug,
        p_query: trimmed,
      });
      if (cancelled) return;
      if (searchError) {
        setError("generic");
        return;
      }
      setResults({ query: trimmed, items: data ?? [] });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, supabase, slug]);

  useEffect(() => {
    if (!joined || !shouldScrollRef.current) return;

    const timer = window.setTimeout(() => {
      sessionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      shouldScrollRef.current = false;
    }, MOTION_MS + 200);

    return () => window.clearTimeout(timer);
  }, [joined]);

  const matches = results?.query === trimmed ? results.items : null;
  const searching = trimmed.length >= MIN_QUERY && matches === null;

  async function join(student: StudentSearchResult) {
    setJoining(student.id);
    setError(null);

    const { data, error: joinError } = await supabase.rpc("join_circle", {
      p_slug: slug,
      p_student_id: student.id,
    });

    setJoining(null);

    if (joinError) {
      setError(
        joinError.message.includes("gender_mismatch")
          ? "genderMismatch"
          : "generic",
      );
      return;
    }

    if (!data?.[0]) {
      setError("generic");
      return;
    }

    setQuery("");
    setResults(null);
    await refreshQueue();
    shouldScrollRef.current = true;
    setJoined(storageKey, { studentId: student.id, name: student.name });
  }

  const myPosition = joined
    ? queue.find((entry) => entry.student_id === joined.studentId)?.queue_order
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <MotionSection show={!joined} className="card">
        <label className="field-label" htmlFor="student-search">
          {t("search.label")}
        </label>
        <input
          id="student-search"
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.placeholder")}
          autoComplete="off"
          autoFocus={!joined}
          enterKeyHint="search"
          role="combobox"
          aria-expanded={Boolean(matches)}
          aria-controls="student-results"
        />
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("search.hint")}
        </p>

        {searching && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("search.searching")}
          </p>
        )}

        {matches && matches.length > 0 && (
          <ul id="student-results" className="mt-3 flex flex-col gap-2">
            {matches.map((student) => (
              <li key={student.id} className="motion-queue-item">
                <button
                  type="button"
                  onClick={() => join(student)}
                  disabled={joining !== null}
                  className="flex w-full items-center justify-between gap-3 rounded-xl
                             border border-border-subtle bg-surface px-4 py-3 text-start
                             transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  <span>
                    <span className="block font-semibold">{student.name}</span>
                    {student.father_name !== "-" && (
                      <span className="block text-sm text-muted-foreground">
                        {t("search.fatherLabel", { name: student.father_name })}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                    {joining === student.id
                      ? t("search.joining")
                      : t("search.join")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {matches && matches.length === 0 && (
          <div className="motion-queue-item mt-3 rounded-xl border border-border-subtle bg-surface-muted p-4">
            <p className="font-semibold">{t("notFound.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("notFound.body")}
            </p>
            <Link
              href={`/${academySlug}/register?circle=${slug}`}
              className="btn-primary mt-3 w-full sm:w-auto"
            >
              {t("notFound.cta")}
            </Link>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-absent">{t(`errors.${error}`)}</p>
        )}
      </MotionSection>

      <MotionSection
        show={Boolean(joined && myPosition !== undefined)}
        className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface"
        delay={120}
      >
        {joined && myPosition !== undefined && (
          <>
            <h2 className="text-lg font-semibold">
              {t("joined.title", { name: joined.name })}
            </h2>
            <p className="mt-1 text-muted-foreground">
              {t("joined.position", { position: String(myPosition) })}
            </p>
          </>
        )}
      </MotionSection>

      <section className="motion-section">
        <h2 className="mb-3 text-lg font-semibold">
          {t("queue.title", { count: String(queue.length) })}
        </h2>

        {queue.length === 0 ? (
          <p className="card text-muted-foreground">{t("queue.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {queue.map((entry, index) => {
              const isMe = joined?.studentId === entry.student_id;
              return (
                <li
                  key={entry.attendance_id}
                  className={`motion-queue-item card flex items-center gap-3 py-3 transition-colors duration-300 ${
                    isMe ? "border-brand-400 bg-brand-50 dark:bg-brand-950" : ""
                  }`}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                               bg-surface-muted text-sm font-bold"
                  >
                    {entry.queue_order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {entry.name}
                      {isMe && (
                        <span className="ms-2 text-sm font-normal text-brand-600 dark:text-brand-300">
                          {t("queue.you")}
                        </span>
                      )}
                    </span>
                    {entry.father_name !== "-" && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {entry.father_name}
                      </span>
                    )}
                  </span>
                  <span className={badgeClass(entry.recitation_status)}>
                    {t(`status.${entry.recitation_status}`)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <MotionSection
        show={Boolean(joined)}
        className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface"
        delay={280}
      >
        <div ref={sessionRef}>
          <p className="text-sm text-muted-foreground">{t("openSessionHint")}</p>
          <a
            href={sessionLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-3 w-full sm:w-auto"
          >
            {t("openSession")}
          </a>
        </div>
      </MotionSection>
    </div>
  );
}

function badgeClass(status: QueueEntry["recitation_status"]) {
  if (status === "reciting") return "badge-reciting";
  if (status === "done") return "badge-done";
  return "badge-waiting";
}
