"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { CopyLinkButton } from "@/components/copy-link-button";
import type { Circle } from "@/lib/database.types";
import { deleteCircle, initialEditCircleState, updateCircle, type EditCircleState } from "./actions";

const CIRCLE_TYPES = ["tasheeh", "tajweed", "free_recitation"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function SubmitButton() {
  const t = useTranslations("common");
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("loading") : t("save")}
    </button>
  );
}

export function EditCircleForm({ circle, locale }: { circle: Circle; locale: string }) {
  const t = useTranslations("dashboard.new");
  const tCircle = useTranslations("circle");
  const tDashboard = useTranslations("dashboard");
  const tAdmin = useTranslations("admin");

  const updateCircleWithId = updateCircle.bind(null, circle.id);
  const [state, formAction] = useActionState<EditCircleState, FormData>(
    updateCircleWithId,
    initialEditCircleState,
  );

  const values = state.status === "idle" ? null : state.values;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const selectedDays = values?.days ?? circle.days_of_week;
  const isActive = values?.isActive ?? circle.is_active;
  const circlePath = `/${locale}/circle/${circle.registration_slug}`;
  const deleteCircleAction = async () => {
    await deleteCircle(circle.id);
  };

  function fieldError(key: keyof typeof fieldErrors) {
    const error = fieldErrors[key];
    if (!error) return null;
    return <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>;
  }

  return (
    <>
      <form action={formAction} className="card flex flex-col gap-5" noValidate>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{tAdmin("circles.title")}</p>
            <h1 className="truncate text-2xl font-semibold">{circle.name}</h1>
          </div>
          <span className={circle.is_active ? "badge-done" : "badge-waiting"}>
            {circle.is_active ? tAdmin("teachers.active") : tAdmin("circles.inactive")}
          </span>
        </div>

        <div>
          <label className="field-label" htmlFor="name">
            {t("fields.name")}
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={values?.name ?? circle.name}
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldError("name")}
        </div>

      <div>
        <label className="field-label" htmlFor="type">
          {t("fields.type")}
        </label>
        <select id="type" name="type" className="input" defaultValue={values?.type ?? circle.type}>
          {CIRCLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {tCircle(`type.${type}`)}
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
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-base font-medium has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-800 dark:has-checked:bg-brand-900 dark:has-checked:text-brand-100"
            >
              <input
                type="radio"
                name="gender"
                value={option}
                defaultChecked={(values?.gender ?? circle.gender_category) === option}
                className="accent-brand-600"
              />
              {tDashboard(`gender.${option}`)}
            </label>
          ))}
        </div>
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
          defaultValue={values?.sessionLink ?? circle.session_link}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.sessionLink)}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">{t("fields.sessionLinkHint")}</p>
        {fieldError("sessionLink")}
      </div>

      <fieldset>
        <legend className="field-label">{t("fields.days")}</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label
              key={day}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm font-medium has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-800 dark:has-checked:bg-brand-900 dark:has-checked:text-brand-100"
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
          defaultValue={values?.startTime ?? circle.start_time.slice(0, 5)}
          aria-invalid={Boolean(fieldErrors.startTime)}
        />
        {fieldError("startTime")}
      </div>

      <div>
        <label className="field-label" htmlFor="timezone">
          {t("fields.timezone")}
        </label>
        <input
          id="timezone"
          name="timezone"
          className="input"
          defaultValue={values?.timezone ?? circle.timezone}
          aria-invalid={Boolean(fieldErrors.timezone)}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">{t("fields.timezoneHint")}</p>
        {fieldError("timezone")}
      </div>

      <div>
        <label className="field-label" htmlFor="duration">
          {t("fields.duration")}
        </label>
        <input
          id="duration"
          name="duration"
          type="number"
          min="5"
          max="480"
          className="input"
          defaultValue={values?.duration ?? String(circle.duration_minutes)}
          aria-invalid={Boolean(fieldErrors.duration)}
        />
        {fieldError("duration")}
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm font-medium">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={isActive}
          className="accent-brand-600"
        />
        <span>{circle.is_active ? "Active circle" : "Reactivate circle"}</span>
      </label>

      <div>
        <label className="field-label" htmlFor="circleLink">
          {t("fields.slug")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="circleLink"
            dir="ltr"
            className="input min-w-0 flex-1 text-start"
            value={circlePath}
            readOnly
            aria-readonly="true"
          />
          <CopyLinkButton path={circlePath} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("fields.slugHint")}</p>
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

        <SubmitButton />
      </form>

      <form
        action={deleteCircleAction}
        onSubmit={(event) => {
          if (!confirm("Delete this circle? It will be deactivated.")) {
            event.preventDefault();
          }
        }}
      >
        <button type="submit" className="btn-secondary w-full">
          Delete circle
        </button>
      </form>
    </>
  );
}
