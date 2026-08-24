"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  AttendanceStatus,
  QueueEntry,
  RecitationStatus,
} from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type SessionClientProps = {
  slug: string;
  circleId: string;
  sessionDate: string;
  initialQueue: QueueEntry[];
};

const ATTENDANCE_OPTIONS: AttendanceStatus[] = ["present", "absent"];
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

  const [queue, setQueue] = useState<QueueEntry[]>(initialQueue);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const { data, error: queueError } = await supabase.rpc("circle_queue", {
      p_slug: slug,
    });
    if (!queueError && data) setQueue(data);
  }, [supabase, slug]);

  // The Realtime payload carries no student names, so an event is only a signal
  // to refetch circle_queue(). This also picks up students joining mid-session.
  useEffect(() => {
    const channel = supabase
      .channel(`teacher-circle:${circleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `circle_id=eq.${circleId}`,
        },
        () => {
          void refreshQueue();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, circleId, refreshQueue]);

  /**
   * Writes go straight to `attendance_records`; the
   * `attendance_update_owner` policy is what actually authorizes them.
   */
  async function updateRow(
    entry: QueueEntry,
    patch: Partial<Pick<QueueEntry, "attendance_status" | "recitation_status">>,
  ) {
    setBusy(entry.attendance_id);
    setError(null);

    // Applied locally first so a one-click action feels immediate; the Realtime
    // event that follows replaces this with the authoritative row.
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

  const counts = {
    present: queue.filter((row) => row.attendance_status === "present").length,
    absent: queue.filter((row) => row.attendance_status === "absent").length,
    pending: queue.filter((row) => row.attendance_status === "pending").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm">
          <span className="font-semibold">{queue.length}</span>{" "}
          <span className="text-muted-foreground">{t("summary.joined")}</span>
        </p>
        <p className="text-sm">
          <span className="font-semibold text-present">{counts.present}</span>{" "}
          <span className="text-muted-foreground">{t("summary.present")}</span>
        </p>
        <p className="text-sm">
          <span className="font-semibold text-absent">{counts.absent}</span>{" "}
          <span className="text-muted-foreground">{t("summary.absent")}</span>
        </p>
        <p className="text-sm">
          <span className="font-semibold">{counts.pending}</span>{" "}
          <span className="text-muted-foreground">{t("summary.pending")}</span>
        </p>
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
              className={`card flex flex-col gap-3 ${
                entry.recitation_status === "reciting"
                  ? "border-accent-400 bg-accent-100/40"
                  : entry.recitation_status === "done"
                    ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center
                             rounded-full bg-surface-muted text-sm font-bold"
                >
                  {entry.queue_order}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{entry.name}</p>
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(entry, -1)}
                    disabled={index === 0 || busy !== null}
                    aria-label={t("reorder.up")}
                    className="rounded-lg border border-border-subtle px-2 py-0.5
                               text-sm transition-colors hover:bg-surface-muted
                               disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(entry, 1)}
                    disabled={index === queue.length - 1 || busy !== null}
                    aria-label={t("reorder.down")}
                    className="rounded-lg border border-border-subtle px-2 py-0.5
                               text-sm transition-colors hover:bg-surface-muted
                               disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("attendance.label")}
                  </span>
                  {ATTENDANCE_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() =>
                        updateRow(entry, {
                          // Clicking the active state clears it back to pending,
                          // so a mis-tap does not need a separate undo control.
                          attendance_status:
                            entry.attendance_status === status ? "pending" : status,
                        })
                      }
                      disabled={busy !== null}
                      aria-pressed={entry.attendance_status === status}
                      className={statusButtonClass(
                        entry.attendance_status === status,
                        status === "present" ? "present" : "absent",
                      )}
                    >
                      {t(`attendance.${status}`)}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("recitation.label")}
                  </span>
                  {RECITATION_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateRow(entry, { recitation_status: status })}
                      disabled={busy !== null}
                      aria-pressed={entry.recitation_status === status}
                      className={statusButtonClass(
                        entry.recitation_status === status,
                        status === "reciting" ? "accent" : "brand",
                      )}
                    >
                      {tCircle(`status.${status}`)}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function statusButtonClass(
  active: boolean,
  tone: "present" | "absent" | "accent" | "brand",
) {
  const base =
    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
    "disabled:opacity-50 border";

  if (!active) {
    return `${base} border-border-subtle bg-surface text-muted-foreground hover:bg-surface-muted`;
  }

  const tones = {
    present: "border-present bg-present text-white",
    absent: "border-absent bg-absent text-white",
    accent: "border-accent-500 bg-accent-500 text-white",
    brand: "border-brand-600 bg-brand-600 text-white",
  } as const;

  return `${base} ${tones[tone]}`;
}
