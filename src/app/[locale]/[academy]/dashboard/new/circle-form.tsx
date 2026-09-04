"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";
import { createCircle } from "./actions";
import { initialNewCircleState, type NewCircleState } from "./state";

/** 0 = Sunday … 6 = Saturday, matching PostgreSQL's `dow`. */
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DEFAULT_DAYS = [0, 1, 2, 3, 4];

function SubmitButton() {
  const t = useTranslations("dashboard.new");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("submitting") : t("submit")}
    </button>
  );
}

type CircleFormProps = {
  defaultTimezone: string;
  /** Non-empty only for admins; a plain teacher owns the circles they create. */
  assignableTeachers: { id: string; label: string }[];
  defaultTeacherId: string;
  /** From `circle_types` — an academy-managed, open-ended list. */
  circleTypes: { slug: string; label: string }[];
  registrationSlug: string;
  academySlug: string;
};

export function CircleForm({
  defaultTimezone,
  assignableTeachers,
  defaultTeacherId,
  circleTypes,
  registrationSlug,
  academySlug,
}: CircleFormProps) {
  const t = useTranslations("dashboard.new");
  const tDashboard = useTranslations("dashboard");

  const createCircleWithSlug = createCircle.bind(null, registrationSlug);
  const [state, formAction] = useActionState<NewCircleState, FormData>(
    createCircleWithSlug,
    initialNewCircleState,
  );

  const values = state.status === "idle" ? null : state.values;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const selectedDays = values?.days ?? DEFAULT_DAYS;

  function fieldError(key: keyof typeof fieldErrors) {
    const error = fieldErrors[key];
    if (!error) return null;
    return <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5" noValidate>
      <input type="hidden" name="duration" value="60" />
      <input type="hidden" name="timezone" value={defaultTimezone} />
      <input type="hidden" name="academySlug" value={academySlug} />

      {/*
        No free-text "teacher name" field — that used to be the only record of
        whose circle this was, back when circles.teacher_id defaulted to
        whoever created it. It is redundant now: the circle's name is set
        server-side from whichever teacher is actually picked below, so this
        select is the single source of truth for "whose circle is this."

        Admins may hand a circle to any active teacher; a plain teacher always
        owns what they create, so they get a hidden field instead of a picker
        they could use to assign work to somebody else.
      */}
      {assignableTeachers.length > 0 ? (
        <div>
          <label className="field-label" htmlFor="teacherId">
            {t("fields.teacher")}
          </label>
          <SearchableSelect
            id="teacherId"
            name="teacherId"
            options={assignableTeachers.map((teacher) => ({
              value: teacher.id,
              label: teacher.label,
            }))}
            defaultValue={values?.teacherId || defaultTeacherId}
            placeholder={t("fields.teacherSearch")}
            noMatches={t("fields.teacherNoMatches")}
            required
          />
          {fieldError("teacherId")}
        </div>
      ) : (
        <input type="hidden" name="teacherId" value={defaultTeacherId} />
      )}

      <div>
        <label className="field-label" htmlFor="type">
          {t("fields.type")}
        </label>
        <select
          id="type"
          name="type"
          className="input"
          defaultValue={values?.type ?? circleTypes[0]?.slug ?? ""}
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
        <legend className="field-label">{t("fields.gender")}</legend>
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
                defaultChecked={(values?.gender ?? "female") === option}
                className="accent-brand-600"
              />
              {tDashboard(`gender.${option}`)}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("fields.genderHint")}
        </p>
        {fieldError("gender")}
      </fieldset>

      <div>
        <label className="field-label" htmlFor="sessionLink">
          {t("fields.sessionLink")}
        </label>
        <input
          id="sessionLink"
          name="sessionLink"
          type="text"
          dir="ltr"
          inputMode="url"
          placeholder="meet.google.com/... or https://meet.google.com/..."
          className="input text-start"
          defaultValue={values?.sessionLink}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.sessionLink)}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("fields.sessionLinkHint")}
        </p>
        {fieldError("sessionLink")}
      </div>

      <fieldset>
        <legend className="field-label">{t("fields.days")}</legend>
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
                defaultChecked={selectedDays.includes(day)}
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
          {t("fields.startTime")}
        </label>
        <input
          id="startTime"
          name="startTime"
          type="time"
          dir="ltr"
          className="input text-start"
          defaultValue={values?.startTime ?? "17:00"}
          aria-invalid={Boolean(fieldErrors.startTime)}
        />
        {fieldError("startTime")}
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
