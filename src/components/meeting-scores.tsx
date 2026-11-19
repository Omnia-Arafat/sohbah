"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Component = { id: string; name_ar: string; name_en: string | null; points: number };
type Score = {
  enrollment_id: string;
  component_id: string;
  attended: boolean;
  points_awarded: number;
  excused: boolean;
  excuse_reason?: string | null;
};
type Student = { enrollment_id: string; student_name: string };

/** Until RUN_STEPS_MEETING_EXCUSE_REASON.sql is applied the column is not there. */
function missingReasonColumn(error: { message?: string; code?: string } | null) {
  return Boolean(error && (error.code === "PGRST204" || /excuse_reason/.test(error.message ?? "")));
}

/**
 * درجات لقاء الأسبوع: the three بنود a معلمة marks at the weekly meeting.
 * `week` is the meeting's own week (what is stored); the marks grade the week
 * before it, which is what the panel and the report show.
 *
 * A student with an عذر has every بند marked excused, with the reason: the
 * report leaves excused بنود out of the week's total, so she loses nothing.
 */
export function MeetingScores({
  cohortId,
  week,
  meetingDate,
  students,
  canEdit,
  teacherId,
  cohortLabel,
}: {
  cohortId: string;
  week: number;
  meetingDate: string;
  students: Student[];
  canEdit: boolean;
  teacherId: string | null;
  cohortLabel?: string;
}) {
  const t = useTranslations("cohortDay.meetingScores");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [components, setComponents] = useState<Component[] | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [excusing, setExcusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const key = `${week}:${students.map((s) => s.enrollment_id).join(",")}`;
  if (loadedFor !== key) {
    setLoadedFor(key);
    setSaveError(false);
    setExcusing(null);
    void (async () => {
      const { data: ruleSet } = await supabase.rpc("track_rule_set_for" as never, {
        p_cohort_id: cohortId,
        p_on: meetingDate,
      } as never);
      const { data: comps } = ruleSet
        ? await supabase
            .from("track_meeting_components" as never)
            .select("id, name_ar, name_en, points")
            .eq("rule_set_id" as never, ruleSet as never)
            .eq("is_active" as never, true as never)
            .order("display_order" as never)
        : { data: [] };
      setComponents((comps ?? []) as unknown as Component[]);

      if (students.length === 0) {
        setScores([]);
        return;
      }
      const read = (columns: string) =>
        supabase
          .from("track_meeting_scores" as never)
          .select(columns)
          .in("enrollment_id" as never, students.map((s) => s.enrollment_id) as never)
          .eq("week_number" as never, week as never);
      let result = await read("enrollment_id, component_id, attended, points_awarded, excused, excuse_reason");
      if (missingReasonColumn(result.error)) {
        result = await read("enrollment_id, component_id, attended, points_awarded, excused");
      }
      setScores((result.data ?? []) as unknown as Score[]);
    })();
  }

  const scoreOf = (enrollmentId: string, componentId: string) =>
    scores.find((s) => s.enrollment_id === enrollmentId && s.component_id === componentId);

  const excuseOf = (enrollmentId: string) => {
    const marks = scores.filter((s) => s.enrollment_id === enrollmentId && s.excused);
    if (marks.length === 0) return null;
    return marks.find((m) => m.excuse_reason)?.excuse_reason ?? "";
  };

  /** Writes rows, and once more without the reason if that column is not there yet. */
  async function save(rows: Score[]) {
    const stamped = (withReason: boolean) =>
      rows.map(({ excuse_reason, ...row }) => ({
        ...row,
        ...(withReason && excuse_reason !== undefined ? { excuse_reason } : {}),
        week_number: week,
        meeting_date: meetingDate,
        recorded_by: teacherId,
        recorded_at: new Date().toISOString(),
      }));
    const upsert = (withReason: boolean) =>
      supabase
        .from("track_meeting_scores" as never)
        .upsert(stamped(withReason) as never, { onConflict: "enrollment_id,week_number,component_id" });
    let { error } = await upsert(true);
    if (missingReasonColumn(error)) ({ error } = await upsert(false));
    return error;
  }

  async function apply(next: Score[]) {
    const before = scores;
    setSaving(true);
    setSaveError(false);
    const replaced = new Set(next.map((s) => `${s.enrollment_id}:${s.component_id}`));
    setScores((current) => [
      ...current.filter((s) => !replaced.has(`${s.enrollment_id}:${s.component_id}`)),
      ...next,
    ]);
    const error = await save(next);
    setSaving(false);
    if (error) {
      console.error("meeting score save failed", error);
      setSaveError(true);
      setScores(before);
      return false;
    }
    return true;
  }

  async function toggle(student: Student, component: Component) {
    if (!canEdit || saving) return;
    const attended = !scoreOf(student.enrollment_id, component.id)?.attended;
    await apply([
      {
        enrollment_id: student.enrollment_id,
        component_id: component.id,
        attended,
        points_awarded: attended ? component.points : 0,
        excused: false,
      },
    ]);
  }

  async function excuse(student: Student, text: string | null) {
    if (!canEdit || saving || !components) return;
    const ok = await apply(
      components.map((c) => ({
        enrollment_id: student.enrollment_id,
        component_id: c.id,
        attended: false,
        points_awarded: 0,
        excused: text !== null,
        ...(text !== null ? { excuse_reason: text.trim() || null } : {}),
      })),
    );
    if (ok) {
      setExcusing(null);
      setReason("");
    }
  }

  if (components === null) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (components.length === 0) return null;

  const max = components.reduce((n, c) => n + Number(c.points), 0);
  const label = (c: Component) => (locale === "ar" ? c.name_ar : c.name_en ?? c.name_ar);
  const meetingDay = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${meetingDate}T00:00:00Z`));

  return (
    <section className="flex flex-col gap-3">
      <div>
        {cohortLabel && (
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{cohortLabel}</p>
        )}
        <h2 className="text-lg font-semibold">
          {week > 1 ? t("title", { week: week - 1 }) : t("titleFirst")}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {week > 1
            ? t("countsFor", { date: meetingDay, week: week - 1 })
            : t("firstMeeting", { date: meetingDay })}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {canEdit ? t("hintEdit", { max }) : t("hintRead", { max })}
        </p>
      </div>

      {saveError && (
        <p role="alert" className="rounded-2xl border border-absent px-4 py-3 text-xs font-bold text-absent">
          {t("saveFailed")}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-end gap-2 border-b border-border-subtle bg-surface-muted px-3 py-2">
          <span className="flex-grow text-[11px] font-bold text-muted-foreground">{t("student")}</span>
          {components.map((c) => (
            <span
              key={c.id}
              className="w-12 shrink-0 text-center text-[10px] leading-tight text-muted-foreground"
            >
              {label(c)}
            </span>
          ))}
          <span className="w-10 shrink-0 text-center text-[10px] leading-tight text-muted-foreground">
            {t("total")}
          </span>
          {canEdit && <span className="w-12 shrink-0" aria-hidden="true" />}
        </div>

        {students.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul>
            {students.map((student) => {
              const excused = excuseOf(student.enrollment_id);
              const total = components.reduce(
                (n, c) => n + Number(scoreOf(student.enrollment_id, c.id)?.points_awarded ?? 0),
                0,
              );
              const open = excusing === student.enrollment_id;
              return (
                <li
                  key={student.enrollment_id}
                  className="border-t border-border-subtle px-3 py-2 first:border-t-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-grow truncate text-[13px] font-semibold">
                      {student.student_name}
                    </span>
                    {excused !== null ? (
                      <span className="flex min-w-0 shrink items-center gap-2">
                        <span className="rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs font-bold text-muted-foreground">
                          {t("excused")}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void excuse(student, null)}
                            disabled={saving}
                            className="text-xs font-semibold text-brand-700 underline disabled:opacity-60 dark:text-brand-300"
                          >
                            {t("removeExcuse")}
                          </button>
                        )}
                      </span>
                    ) : (
                      <>
                        {components.map((c) => {
                          const on = Boolean(scoreOf(student.enrollment_id, c.id)?.attended);
                          const Cell = canEdit ? "button" : "span";
                          return (
                            <span key={c.id} className="flex w-12 shrink-0 justify-center">
                              <Cell
                                {...(canEdit
                                  ? {
                                      type: "button" as const,
                                      onClick: () => void toggle(student, c),
                                      disabled: saving,
                                      "aria-pressed": on,
                                    }
                                  : {})}
                                title={label(c)}
                                className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
                                  on
                                    ? "bg-brand-600 text-white"
                                    : "border-2 border-accent-500 text-accent-700 dark:text-accent-200"
                                } ${canEdit ? "cursor-pointer transition active:scale-95 disabled:opacity-60" : ""}`}
                              >
                                {on ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : ""}
                                <span className="sr-only">
                                  {t(on ? "doneLabel" : "missingLabel", { item: label(c) })}
                                </span>
                              </Cell>
                            </span>
                          );
                        })}
                        <span className="w-10 shrink-0 text-center text-sm font-bold tabular-nums">
                          {total}/{max}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setExcusing(open ? null : student.enrollment_id);
                              setReason("");
                            }}
                            aria-expanded={open}
                            className="w-12 shrink-0 rounded-lg border border-border-subtle py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-brand-300"
                          >
                            {t("excuse")}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {excused && <p className="mt-1 text-xs text-muted-foreground">{t("reasonIs", { reason: excused })}</p>}

                  {open && excused === null && (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void excuse(student, reason);
                      }}
                    >
                      <input
                        type="text"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={t("reasonPlaceholder")}
                        aria-label={t("reasonLabel", { name: student.student_name })}
                        maxLength={200}
                        autoFocus
                        className="input min-h-11 min-w-0 flex-grow text-sm"
                      />
                      <button type="submit" disabled={saving} className="btn-primary min-h-11 px-4 text-sm">
                        {t("saveExcuse")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcusing(null)}
                        className="btn-secondary min-h-11 px-4 text-sm"
                      >
                        {t("cancel")}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
