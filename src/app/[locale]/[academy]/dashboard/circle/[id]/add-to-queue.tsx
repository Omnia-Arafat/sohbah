"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";
import type { createClient } from "@/lib/supabase/client";

type AddResult = {
  attendance_id: string;
  session_date: string;
  queue_order: number;
  already_joined: boolean;
};

/**
 * The معلمة or مشرفة gives a student a turn herself — for a student whose
 * link will not open, who has no phone with her, or who arrives after
 * registration has closed. `staff_add_to_queue()` decides who may; this only
 * offers the students who are not in today's list yet.
 *
 * The new turn goes to the end of the list, like a student joining from her
 * link; the arrows on her card move it from there.
 */
export function AddToQueue({
  supabase,
  circleId,
  students,
  queuedStudentIds,
  onAdded,
}: {
  supabase: ReturnType<typeof createClient>;
  circleId: string;
  students: { id: string; label: string }[];
  queuedStudentIds: Set<string>;
  onAdded: () => Promise<unknown>;
}) {
  const t = useTranslations("session.add");
  const [studentId, setStudentId] = useState("");
  // Remounts the picker after each add, so it comes back empty.
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const options = students
    .filter((student) => !queuedStudentIds.has(student.id))
    .map((student) => ({ value: student.id, label: student.label }));

  async function add() {
    const student = students.find((s) => s.id === studentId);
    if (!student) {
      setMessage({ tone: "error", text: t("pickFirst") });
      return;
    }

    setBusy(true);
    setMessage(null);
    // Not in the generated types until RUN_STEPS_STAFF_ADD_TO_QUEUE.sql runs.
    const { data, error } = await supabase.rpc("staff_add_to_queue" as never, {
      p_circle_id: circleId,
      p_student_id: student.id,
    } as never);
    const row = (data as AddResult[] | null)?.[0];

    if (error || !row) {
      console.error("staff_add_to_queue failed", error);
      const known = ["not_today", "forbidden", "gender_mismatch"];
      const key = known.find((code) => error?.message === code) ?? "generic";
      setMessage({ tone: "error", text: t(`errors.${key}`) });
      setBusy(false);
      return;
    }

    await onAdded();
    setMessage({
      tone: "ok",
      text: t(row.already_joined ? "already" : "added", {
        name: student.label,
        position: row.queue_order,
      }),
    });
    setStudentId("");
    setRound((n) => n + 1);
    setBusy(false);
  }

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            key={round}
            id="add-to-queue"
            name="studentId"
            options={options}
            placeholder={t("placeholder")}
            noMatches={t("noMatches")}
            onValueChange={(value) => {
              setStudentId(value);
              setMessage(null);
            }}
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy || !studentId}
          className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-4"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" />
          {busy ? t("adding") : t("submit")}
        </button>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-sm ${message.tone === "error" ? "text-absent" : "text-present"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
