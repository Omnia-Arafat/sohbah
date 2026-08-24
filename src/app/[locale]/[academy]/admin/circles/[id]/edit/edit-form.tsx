"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { updateCircle } from "./actions";

const CIRCLE_TYPES = ["tasheeh", "tajweed", "free_recitation"] as const;
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
};

type EditCircleFormProps = {
  circle: Circle;
  teachers: Teacher[];
  academySlug: string;
};

export function EditCircleForm({ circle, teachers, academySlug }: EditCircleFormProps) {
  const locale = useLocale();
  const t = useTranslations("admin.circles");
  const tCircle = useTranslations("circle");
  const tDashboard = useTranslations("dashboard");
  const [state, formAction] = useActionState(updateCircle, { status: "idle" });

  const values = state.status === "idle" ? circle : (state as any).values || circle;
  const fieldErrors = state.status === "invalid" ? (state as any).fieldErrors : {};

  function fieldError(key: string) {
    const error = fieldErrors[key];
    if (!error) return null;
    return <p className="mt-1.5 text-sm text-absent">{error}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5" noValidate>
      <input type="hidden" name="circleId" value={circle.id} />
      <input type="hidden" name="academySlug" value={academySlug} />

      <div>
        <label className="field-label" htmlFor="name">
          {t("circleName")}
        </label>
        <input
          id="name"
          name="name"
          className="input"
          defaultValue={values.name}
          required
          aria-invalid={Boolean(fieldErrors.name)}
        />
        {fieldError("name")}
      </div>

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
          {CIRCLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {tCircle(`type.${type}`)}
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
        <select
          id="teacher"
          name="teacher_id"
          className="input"
          defaultValue={values.teacher_id}
          required
        >
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {getTeacherDisplayLabel(teacher, academySlug, locale)}
            </option>
          ))}
        </select>
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
          defaultValue={values.start_time}
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
        <label className="field-label" htmlFor="status">
          {t("status")}
        </label>
        <select
          id="status"
          name="status"
          className="input"
          defaultValue={values.is_active !== undefined ? (values.is_active ? "active" : "inactive") : (values.status ?? "active")}
        >
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
        </select>
        {fieldError("status")}
      </div>

      {state.status === "error" && (
        <p className="text-sm text-absent">{(state as any).message}</p>
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
