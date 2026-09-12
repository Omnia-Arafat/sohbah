"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { Curriculum, CurriculumUnit } from "@/lib/database.types";
import { setTodayLesson, type LessonState } from "./lesson-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("session.lesson");
  return (
    <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

/**
 * "What are we on today?" — one select and a note.
 *
 * The units come pre-grouped by curriculum, so a حلقة حديث that follows two
 * books at once still reads as two lists rather than one long run of titles.
 * Circles whose type has no curriculum yet get a link to go and make one
 * instead of an empty dropdown that explains nothing.
 */
export function LessonPicker({
  academySlug,
  circleId,
  curricula,
  unitsByCurriculum,
  currentUnitId,
  currentNote,
}: {
  academySlug: string;
  circleId: string;
  curricula: Curriculum[];
  unitsByCurriculum: Record<string, CurriculumUnit[]>;
  currentUnitId: string | null;
  currentNote: string | null;
  locale?: string;
}) {
  const t = useTranslations("session.lesson");
  const [state, formAction] = useActionState<LessonState, FormData>(
    setTodayLesson,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="circleId" value={circleId} />

      <div>
        <label className="field-label" htmlFor="unitId">
          {t("field")}
        </label>
        <select
          id="unitId"
          name="unitId"
          className="input"
          defaultValue={currentUnitId ?? ""}
        >
          <option value="">{t("none")}</option>
          {curricula.map((curriculum) => (
            <optgroup key={curriculum.id} label={curriculum.name_ar}>
              {(unitsByCurriculum[curriculum.id] ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.position}. {unit.title_ar}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="note">
          {t("note")}
        </label>
        <input
          id="note"
          name="note"
          className="input"
          placeholder={t("notePlaceholder")}
          defaultValue={currentNote ?? ""}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.status === "saved" && (
          <span className="text-sm text-brand-700 dark:text-brand-300">
            {t("saved")}
          </span>
        )}
        {state.status === "failed" && (
          <span className="text-sm text-absent">{t("error")}</span>
        )}
      </div>
    </form>
  );
}
