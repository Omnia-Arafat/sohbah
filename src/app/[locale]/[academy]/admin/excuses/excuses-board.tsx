"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Request = {
  request_id: string;
  student_name: string;
  father_name: string;
  absence_date: string;
  reason: string | null;
  cohort_name: string;
  track_name: string;
  asked_at: string;
};

/**
 * Excuse requests waiting on a decision.
 *
 * Accepting one is what actually forgives the day — it writes the
 * `track_absences` row in the teacher's name. Declining leaves the day as it
 * was: a computed absence, which is what it already is while the request
 * sits here, so nothing worsens by saying no.
 */
export function ExcusesBoard({
  academyId,
  locale,
}: {
  academyId: string;
  locale: string;
}) {
  const t = useTranslations("excuses");
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "pending_excuses" as never,
        { p_academy_id: academyId } as never,
      );
      if (rpcError) {
        setError(true);
        return;
      }
      setRows((data ?? []) as unknown as Request[]);
    })();
  }

  async function decide(id: string, accept: boolean) {
    setBusy(id);
    setError(false);
    const { error: rpcError } = await supabase.rpc("decide_excuse" as never, {
      p_request_id: id,
      p_accept: accept,
    } as never);
    setBusy(null);
    if (rpcError) {
      setError(true);
      return;
    }
    // Decided rows leave the list: this screen is a queue, and a queue that
    // keeps what it has finished stops being one.
    setRows((prev) => (prev ?? []).filter((r) => r.request_id !== id));
  }

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (error && rows === null) {
    return <p className="card text-sm text-absent">{t("failed")}</p>;
  }
  if (rows === null) {
    return <p className="card text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (rows.length === 0) {
    return (
      <section className="card">
        <p className="font-semibold">{t("empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("emptyNote")}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-absent/40 bg-absent/5 px-4 py-3 text-sm text-absent"
        >
          {t("failed")}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li
            key={r.request_id}
            className="rounded-2xl border border-border-subtle bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-sm font-bold">{r.student_name}</p>
              <p className="min-w-0 flex-grow truncate text-xs text-muted-foreground">
                {r.track_name} · {r.cohort_name}
              </p>
            </div>

            <p className="mt-1 text-xs font-semibold text-accent-700 dark:text-accent-200">
              {dateFmt.format(new Date(`${r.absence_date}T00:00:00Z`))}
            </p>

            {/* Her words, plainly. A reason is the whole basis of the decision,
                so it is not truncated into a tooltip. */}
            {r.reason ? (
              <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm leading-relaxed">
                {r.reason}
              </p>
            ) : (
              <p className="mt-2 text-xs italic text-muted-foreground">
                {t("noReason")}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy === r.request_id}
                onClick={() => decide(r.request_id, true)}
                className="btn-primary min-h-11 flex-grow disabled:opacity-60"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("accept")}
                </span>
              </button>
              <button
                type="button"
                disabled={busy === r.request_id}
                onClick={() => decide(r.request_id, false)}
                className="btn-secondary min-h-11 shrink-0 px-4 disabled:opacity-60"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t("decline")}
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}
