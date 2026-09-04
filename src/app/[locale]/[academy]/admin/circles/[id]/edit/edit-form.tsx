"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { updateCircle, type UpdateCircleState } from "./actions";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.circles");

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("saving") : t("saveChanges")}
    </button>
  );
}

type Teacher = {
  id: string;
  name: string;
  role: string;
};

type Circle = {
  id: string;
  name: string;
  type: string;
  gender_category: string;
  session_link: string;
  timezone: string;
  start_time: string;
  duration_minutes: number;
  days_of_week: number[];
  teacher_id: string;
  is_active: boolean;
  max_students: number | null;
};

type EditCircleFormProps = {
  circle: Circle;
  teachers: Teacher[];
  /** From `circle_types` — an academy-managed, open-ended list. */
  circleTypes: { slug: string; label: string }[];
  academySlug: string;
};

export function EditCircleForm({
  circle,
  teachers,
  circleTypes,
  academySlug,
}: EditCircleFormProps) {
  const locale = useLocale();
  const t = useTranslations("admin.circles");
  const tDashboard = useTranslations("dashboard");
  const [state, formAction] = useActionState<UpdateCircleState, FormData>(
    updateCircle,
    { status: "idle" },
  );

  const values = state.status === "invalid" ? state.values : circle;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const selectedStatus =
    state.status === "invalid"
      ? state.values.status
      : circle.is_active
        ? "active"
        : "inactive";

  /** The action returns message keys, not sentences, so it stays locale-free. */
  function fieldError(key: string) {
    const error = fieldErrors[key];
    if (!error) return null;
    return (
      <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>
    );
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5" noValidate>
      <input type="hidden" name="circleId" value={circle.id} />
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label className="field-label" htmlFor="type">
          {t("type")}
        </label>
        <select
          id="type"
          name="type"
          className="input"
          defaultValue={values.type}
        >
          {circleTypes.map((type) => (
            <option key={type.slug} value={type.slug}>
              {type.label}
            </option>
          ))}
        </select>
        {fieldError("type")}
      </div>

      <fieldset>
        <legend className="field-label">{t("gender")}</legend>
        <div className="flex gap-3">
          {(["male", "female"] as const).map((option) => (
            <label
              key={option}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2
                         rounded-xl border border-border-subtle bg-surface px-4 py-3
                         text-base font-medium has-checked:border-brand-600
                         has-checked:bg-brand-50 has-checked:text-brand-800
                         dark:has-checked:bg-brand-900 dark:has-checked:text-brand-100"
            >
              <input
                type="radio"
                name="gender"
                value={option}
                defaultChecked={values.gender_category === option}
                className="accent-brand-600"
              />
              {tDashboard(`gender.${option}`)}
            </label>
          ))}
        </div>
        {fieldError("gender")}
      </fieldset>

      <div>
        <label className="field-label" htmlFor="teacher">
          {t("assignedTeacher")}
        </label>
        <SearchableSelect
          id="teacher"
          name="teacher_id"
          options={teachers.map((teacher) => ({
            value: teacher.id,
            label: getTeacherDisplayLabel(teacher, academySlug, locale),
          }))}
          defaultValue={values.teacher_id}
          placeholder={t("teacherSearch")}
          noMatches={t("teacherNoMatches")}
          required
        />
        {fieldError("teacher_id")}
      </div>

      <div>
        <label className="field-label" htmlFor="sessionLink">
          {t("sessionLink")}
        </label>
        <input
          id="sessionLink"
          name="sessionLink"
          type="text"
          dir="ltr"
          inputMode="url"
          placeholder="meet.google.com/... or https://meet.google.com/..."
          className="input text-start"
          defaultValue={values.session_link}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.sessionLink)}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("sessionLinkHint")}
        </p>
        {fieldError("sessionLink")}
      </div>

      <fieldset>
        <legend className="field-label">{t("daysOfWeek")}</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label
              key={day}
              className="flex cursor-pointer items-center gap-2 rounded-xl border
                         border-border-subtle bg-surface px-3 py-2 text-sm font-medium
                         has-checked:border-brand-600 has-checked:bg-brand-50
                         has-checked:text-brand-800 dark:has-checked:bg-brand-900
                         dark:has-checked:text-brand-100"
            >
              <input
                type="checkbox"
                name="days"
                value={day}
                defaultChecked={values.days_of_week?.includes(day)}
                className="accent-brand-600"
              />
              {tDashboard(`daysShort.${day}`)}
            </label>
          ))}
        </div>
        {fieldError("days")}
      </fieldset>

      <div>
        <label className="field-label" htmlFor="startTime">
          {t("startTime")}
        </label>
        <input
          id="startTime"
          name="startTime"
          type="time"
          dir="ltr"
          className="input text-start"
          // PostgreSQL returns `time` values with seconds, while browser time
          // inputs submit HH:MM. Keep the edit form on that shared format.
          defaultValue={String(values.start_time).slice(0, 5)}
          required
          aria-invalid={Boolean(fieldErrors.startTime)}
        />
        {fieldError("startTime")}
      </div>

      <div>
        <label className="field-label" htmlFor="duration">
          {t("duration")}
        </label>
        <input
          id="duration"
          name="duration"
          type="number"
          min="5"
          max="480"
          className="input"
          defaultValue={values.duration_minutes}
          required
          aria-invalid={Boolean(fieldErrors.duration)}
        />
        {fieldError("duration")}
      </div>

      <div>
        <label className="field-label" htmlFor="maxStudents">
          {t("maxStudents")}
        </label>
        <input
          id="maxStudents"
          name="maxStudents"
          type="number"
          inputMode="numeric"
          min="1"
          max="500"
          dir="ltr"
          className="input text-start"
          placeholder={t("maxStudentsPlaceholder")}
          defaultValue={values.max_students ?? ""}
          aria-invalid={Boolean(fieldErrors.maxStudents)}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("maxStudentsHint")}
        </p>
        {fieldError("maxStudents")}
      </div>

      <div>
        <label className="field-label" htmlFor="status">
          {t("status")}
        </label>
        <select
          id="status"
          name="status"
          className="input"
          defaultValue={selectedStatus}
        >
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
        </select>
        {fieldError("status")}
      </div>

      {state.status === "error" && (
        <p className="text-sm text-absent">{t(`errors.${state.message}`)}</p>
      )}

      {state.status === "success" && (
        <p className="text-sm text-accent-600">{t("saved")}</p>
      )}

      <div className="flex gap-3">
        <Link
          href={`/${academySlug}/admin/circles`}
          className="btn-secondary flex-1 text-center"
        >
          {t("cancel")}
        </Link>
        <div className="flex-1">
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
