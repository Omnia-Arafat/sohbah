"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QueueEntry, RecitationStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type SessionClientProps = {
  slug: string;
  circleId: string;
  sessionDate: string;
  initialQueue: QueueEntry[];
};

const RECITATION_OPTIONS: RecitationStatus[] = ["waiting", "reciting", "done"];

export function SessionClient({
  slug,
  circleId,
  sessionDate,
  initialQueue,
}: SessionClientProps) {
  const t = useTranslations("session");
  const tCircle = useTranslations("circle");
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const queueKey = useMemo(() => ["circle-queue", slug] as const, [slug]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Seeded from the server render and then left alone. The query defaults
   * (see `QueryProvider`) switch off every automatic refetch, so this list is
   * a snapshot: students who join mid-session, and edits made by anyone else,
   * appear only when the page is refreshed.
   */
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

  /** Writes the authoritative list into the cache after a failed mutation. */
  const refreshQueue = async () => {
    const { data, error: queueError } = await supabase.rpc("circle_queue", {
      p_slug: slug,
    });
    if (!queueError && data) {
      queryClient.setQueryData(queueKey, data as QueueEntry[]);
    }
  };

  /** Applies a local edit. The user's own action is reflected immediately. */
  const setQueue = (
    update: QueueEntry[] | ((current: QueueEntry[]) => QueueEntry[]),
  ) => {
    queryClient.setQueryData<QueueEntry[]>(queueKey, (current = []) =>
      typeof update === "function" ? update(current) : update,
    );
  };

  /**
   * Writes go straight to `attendance_records`; the
   * `attendance_update_owner` policy is what actually authorizes them.
   */
  async function updateRow(
    entry: QueueEntry,
    patch: Partial<Pick<QueueEntry, "recitation_status">>,
  ) {
    setBusy(entry.attendance_id);
    setError(null);

    // Written to the cache first so a one-click action feels immediate. Nothing
    // refetches to confirm it — only a failure below pulls the real row back.
    setQueue((current) =>
      current.map((row) =>
        row.attendance_id === entry.attendance_id ? { ...row, ...patch } : row,
      ),
    );

    const { error: updateError } = await supabase
      .from("attendance_records")
      .update(patch)
      .eq("id", entry.attendance_id);

    setBusy(null);

    if (updateError) {
      console.error("attendance update failed", updateError);
      setError("generic");
      await refreshQueue();
    }
  }

  /**
   * `reorder_queue()` assigns positions from the array's ordinality, so the
   * whole queue is submitted rather than just the two rows that swapped.
   */
  async function move(entry: QueueEntry, offset: -1 | 1) {
    const index = queue.findIndex(
      (row) => row.attendance_id === entry.attendance_id,
    );
    const target = index + offset;
    if (index === -1 || target < 0 || target >= queue.length) return;

    const reordered = [...queue];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    setBusy(entry.attendance_id);
    setError(null);
    setQueue(reordered.map((row, position) => ({ ...row, queue_order: position + 1 })));

    const { error: reorderError } = await supabase.rpc("reorder_queue", {
      p_circle_id: circleId,
      p_session_date: sessionDate,
      p_student_ids: reordered.map((row) => row.student_id),
    });

    setBusy(null);

    if (reorderError) {
      console.error("reorder_queue failed", reorderError);
      setError("generic");
      await refreshQueue();
    }
  }

  /**
   * Removing a student deletes their `attendance_records` row for today, which
   * leaves a hole in `queue_order`; the follow-up `reorder_queue()` closes it.
   * Nothing stops the student rejoining from the circle link — this clears the
   * live order, it is not a ban.
   */
  async function remove(entry: QueueEntry) {
    if (!window.confirm(t("remove.confirm", { name: entry.name }))) return;

    const remaining = queue.filter(
      (row) => row.attendance_id !== entry.attendance_id,
    );

    setBusy(entry.attendance_id);
    setError(null);
    setQueue(
      remaining.map((row, position) => ({ ...row, queue_order: position + 1 })),
    );

    const { error: deleteError } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", entry.attendance_id);

    if (deleteError) {
      console.error("attendance delete failed", deleteError);
      setBusy(null);
      setError("generic");
      await refreshQueue();
      return;
    }

    const { error: reorderError } = await supabase.rpc("reorder_queue", {
      p_circle_id: circleId,
      p_session_date: sessionDate,
      p_student_ids: remaining.map((row) => row.student_id),
    });

    setBusy(null);

    // The row is already gone, so a failed renumber is cosmetic: refetch and
    // show the real positions rather than pretending the gap was closed.
    if (reorderError) {
      console.error("reorder_queue failed", reorderError);
      setError("generic");
      await refreshQueue();
    }
  }

  // Everyone in the queue is present by definition, so the useful split is how
  // far through the recitations the circle has got.
  const counts = {
    waiting: queue.filter((row) => row.recitation_status === "waiting").length,
    reciting: queue.filter((row) => row.recitation_status === "reciting").length,
    done: queue.filter((row) => row.recitation_status === "done").length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Four equal cells rather than a wrapping row: the numbers stay in the
          same place as they change, so the teacher can glance instead of read. */}
      <section className="card grid grid-cols-4 gap-2 p-4 text-center">
        <SummaryCell value={queue.length} label={t("summary.joined")} />
        <SummaryCell value={counts.waiting} label={tCircle("status.waiting")} />
        <SummaryCell
          value={counts.reciting}
          label={tCircle("status.reciting")}
          tone="text-reciting"
        />
        <SummaryCell
          value={counts.done}
          label={tCircle("status.done")}
          tone="text-present"
        />
      </section>

      {error && (
        <p className="text-sm text-absent" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}

      {queue.length === 0 ? (
        <p className="card text-muted-foreground">{t("queue.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {queue.map((entry, index) => (
            <li
              key={entry.attendance_id}
              className={`card gap-0 overflow-hidden p-0 transition-colors ${cardToneClass(
                entry.recitation_status,
              )}`}
            >
              {/* Row 1 — identity and controls. The name column is the only
                  `1fr` track, so long names truncate instead of shoving the
                  buttons off a narrow screen. */}
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
                <span className={positionBadgeClass(entry.recitation_status)}>
                  {entry.queue_order}
                </span>

                <div className="min-w-0">
                  <p className="truncate font-semibold leading-tight">
                    {entry.name}
                  </p>
                  {entry.father_name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.father_name}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* One bordered pill rather than two loose buttons: the pair
                      reads as a single "move this row" control. */}
                  <div
                    className="flex flex-col overflow-hidden rounded-xl
                               border border-border-subtle bg-surface shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => move(entry, -1)}
                      disabled={index === 0 || busy !== null}
                      aria-label={t("reorder.up")}
                      title={t("reorder.up")}
                      className={REORDER_BUTTON}
                    >
                      <ChevronUp
                        aria-hidden="true"
                        className="h-4 w-4 transition-transform duration-150
                                   group-hover:-translate-y-0.5"
                      />
                    </button>

                    <span aria-hidden="true" className="h-px bg-border-subtle" />

                    <button
                      type="button"
                      onClick={() => move(entry, 1)}
                      disabled={index === queue.length - 1 || busy !== null}
                      aria-label={t("reorder.down")}
                      title={t("reorder.down")}
                      className={REORDER_BUTTON}
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className="h-4 w-4 transition-transform duration-150
                                   group-hover:translate-y-0.5"
                      />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(entry)}
                    disabled={busy !== null}
                    aria-label={t("remove.label")}
                    title={t("remove.label")}
                    className="flex h-9 w-9 items-center justify-center rounded-xl
                               border border-border-subtle bg-surface text-absent
                               shadow-sm transition-colors duration-150 hover:border-absent
                               hover:bg-absent hover:text-white focus-visible:outline-2
                               focus-visible:outline-offset-2 focus-visible:outline-absent
                               disabled:pointer-events-none disabled:opacity-25"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Row 2 — recitation as a segmented control. Three equal tracks
                  give each state the same weight and a full-width tap target,
                  and the label is dropped: it is the only control left. */}
              <div
                role="group"
                aria-label={t("recitation.label")}
                className="grid grid-cols-3 gap-1 border-t border-border-subtle
                           bg-surface-muted/60 p-1"
              >
                {RECITATION_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateRow(entry, { recitation_status: status })}
                    disabled={busy !== null}
                    aria-pressed={entry.recitation_status === status}
                    className={segmentClass(
                      entry.recitation_status === status,
                      status,
                    )}
                  >
                    {tCircle(`status.${status}`)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Sized for a thumb (36×32) — reordering happens on a phone mid-session, and
 * the old text arrows were a ~14px tap target.
 */
const REORDER_BUTTON =
  "group flex h-8 w-9 items-center justify-center text-muted-foreground " +
  "transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 " +
  "active:bg-brand-100 focus-visible:outline-2 focus-visible:-outline-offset-2 " +
  "focus-visible:outline-brand-600 disabled:pointer-events-none " +
  "disabled:opacity-25 dark:hover:bg-brand-900 dark:hover:text-brand-100 " +
  "dark:active:bg-brand-800";

function SummaryCell({
  value,
  label,
  tone = "text-foreground",
}: {
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className={`text-2xl font-bold tabular-nums leading-none ${tone}`}>
        {value}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** The card's own tint. Gold is reserved for whoever is reciting right now. */
function cardToneClass(status: RecitationStatus) {
  if (status === "reciting") {
    return "border-accent-400 bg-accent-100/40 shadow-md dark:bg-accent-700/15";
  }
  if (status === "done") {
    return "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/50";
  }
  return "";
}

/** The queue position doubles as the status light, so the badge carries it. */
function positionBadgeClass(status: RecitationStatus) {
  const base =
    "flex h-10 w-10 items-center justify-center rounded-full text-base " +
    "font-bold tabular-nums transition-colors";

  if (status === "reciting") return `${base} bg-accent-500 text-white shadow-sm`;
  if (status === "done") return `${base} bg-brand-600 text-white`;
  return `${base} bg-surface-muted text-muted-foreground`;
}

/** One cell of the recitation segmented control. */
function segmentClass(active: boolean, status: RecitationStatus) {
  const base =
    "rounded-lg px-2 py-2 text-xs font-semibold transition-colors duration-150 " +
    "focus-visible:outline-2 focus-visible:-outline-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50";

  if (!active) {
    return (
      `${base} text-muted-foreground hover:bg-surface hover:text-foreground ` +
      "focus-visible:outline-brand-600"
    );
  }

  const tones: Record<RecitationStatus, string> = {
    waiting: "bg-surface text-foreground shadow-sm focus-visible:outline-brand-600",
    reciting: "bg-accent-500 text-white shadow-sm focus-visible:outline-accent-700",
    done: "bg-brand-600 text-white shadow-sm focus-visible:outline-brand-600",
  };

  return `${base} ${tones[status]}`;
}
