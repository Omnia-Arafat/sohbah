"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Component = { id: string; name_ar: string; name_en: string | null; points: number };
type Score = { enrollment_id: string; component_id: string; attended: boolean; points_awarded: number };
type Student = { enrollment_id: string; student_name: string };

/** درجات لقاء الأسبوع: the three بنود a معلمة marks at the weekly meeting. */
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

  const key = `${week}:${students.map((s) => s.enrollment_id).join(",")}`;
  if (loadedFor !== key) {
    setLoadedFor(key);
    setSaveError(false);
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
      const { data: rows } = await supabase
        .from("track_meeting_scores" as never)
        .select("enrollment_id, component_id, attended, points_awarded")
        .in("enrollment_id" as never, students.map((s) => s.enrollment_id) as never)
        .eq("week_number" as never, week as never);
      setScores((rows ?? []) as unknown as Score[]);
    })();
  }

  const scoreOf = (enrollmentId: string, componentId: string) =>
    scores.find((s) => s.enrollment_id === enrollmentId && s.component_id === componentId);

  async function toggle(student: Student, component: Component) {
    if (!canEdit || saving) return;
    const before = scores;
    const attended = !scoreOf(student.enrollment_id, component.id)?.attended;
    const next: Score = {
      enrollment_id: student.enrollment_id,
      component_id: component.id,
      attended,
      points_awarded: attended ? component.points : 0,
    };
    setSaving(true);
    setSaveError(false);
    setScores((current) => [
      ...current.filter(
        (s) => !(s.enrollment_id === next.enrollment_id && s.component_id === next.component_id),
      ),
      next,
    ]);
    const { error } = await supabase.from("track_meeting_scores" as never).upsert(
      {
        ...next,
        week_number: week,
        meeting_date: meetingDate,
        recorded_by: teacherId,
        recorded_at: new Date().toISOString(),
      } as never,
      { onConflict: "enrollment_id,week_number,component_id" },
    );
    setSaving(false);
    if (error) {
      console.error("meeting score save failed", error);
      setSaveError(true);
      setScores(before);
    }
  }

  if (components === null) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (components.length === 0) return null;

  const max = components.reduce((n, c) => n + Number(c.points), 0);
  const label = (c: Component) => (locale === "ar" ? c.name_ar : c.name_en ?? c.name_ar);

  return (
    <section className="flex flex-col gap-3">
      <div>
        {cohortLabel && (
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{cohortLabel}</p>
        )}
        <h2 className="text-lg font-semibold">{t("title", { week })}</h2>
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
        </div>

        {students.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul>
            {students.map((student) => {
              const total = components.reduce(
                (n, c) => n + Number(scoreOf(student.enrollment_id, c.id)?.points_awarded ?? 0),
                0,
              );
              return (
                <li
                  key={student.enrollment_id}
                  className="flex items-center gap-2 border-t border-border-subtle px-3 py-2 first:border-t-0"
                >
                  <span className="min-w-0 flex-grow truncate text-[13px] font-semibold">
                    {student.student_name}
                  </span>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
