"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { ScheduleBoardState } from "./actions";

/** Shared by the create form on the list page and the edit page. */
export type BoardFormValues = {
  titleAr: string;
  titleEn: string;
  circleType: string;
  gender: string;
  startFrom: string;
  startTo: string;
  noteAr: string;
  noteEn: string;
  displayOrder: string;
};

const EMPTY: BoardFormValues = {
  titleAr: "",
  titleEn: "",
  circleType: "",
  gender: "",
  startFrom: "",
  startTo: "",
  noteAr: "",
  noteEn: "",
  displayOrder: "0",
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ScheduleBoardForm({
  academySlug,
  circleTypes,
  action,
  boardId,
  initial,
  submitLabel,
  submittingLabel,
}: {
  academySlug: string;
  circleTypes: { slug: string; label: string }[];
  action: (state: ScheduleBoardState, formData: FormData) => Promise<ScheduleBoardState>;
  /** Present only when editing an existing board. */
  boardId?: string;
  initial?: BoardFormValues;
  submitLabel: string;
  submittingLabel: string;
}) {
  const t = useTranslations("admin.schedules");
  const tDashboard = useTranslations("dashboard");
  const [state, formAction] = useActionState<ScheduleBoardState, FormData>(action, {
    status: "idle",
  });

  const values = state.status === "idle" ? (initial ?? EMPTY) : state.values;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  function fieldError(key: keyof BoardFormValues) {
    const error = fieldErrors[key];
    if (!error) return null;
    return <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      {boardId && <input type="hidden" name="boardId" value={boardId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="titleAr">
            {t("fields.titleAr")}
          </label>
          <input
            id="titleAr"
            name="titleAr"
            className="input"
            defaultValue={values.titleAr}
            aria-invalid={Boolean(fieldErrors.titleAr)}
          />
          {fieldError("titleAr")}
        </div>

        <div>
          <label className="field-label" htmlFor="titleEn">
            {t("fields.titleEn")}
          </label>
          <input
            id="titleEn"
            name="titleEn"
            dir="ltr"
            className="input text-start"
            defaultValue={values.titleEn}
            aria-invalid={Boolean(fieldErrors.titleEn)}
          />
          {fieldError("titleEn")}
        </div>

        <div>
          <label className="field-label" htmlFor="circleType">
            {t("fields.circleType")}
          </label>
          <select
            id="circleType"
            name="circleType"
            className="input"
            defaultValue={values.circleType}
          >
            <option value="">{t("fields.circleTypePlaceholder")}</option>
            {circleTypes.map((type) => (
              <option key={type.slug} value={type.slug}>
                {type.label}
              </option>
            ))}
          </select>
          {fieldError("circleType")}
        </div>

        <div>
          <label className="field-label" htmlFor="gender">
            {t("fields.gender")}
          </label>
          <select id="gender" name="gender" className="input" defaultValue={values.gender}>
            <option value="">{t("fields.genderBoth")}</option>
            <option value="female">{tDashboard("gender.female")}</option>
            <option value="male">{tDashboard("gender.male")}</option>
          </select>
        </div>
      </div>

      {/*
        The printed timetable splits one circle type into separate columns by
        the hour — "تصحيح تلاوة 2ظ" and "تصحيح تلاوة 5م" are the same type at
        different times. Leaving both empty keeps every hour, which is what a
        board that does not need the split wants.
      */}
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <legend className="px-2 text-sm font-medium">{t("fields.timeWindow")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="startFrom">
              {t("fields.startFrom")}
            </label>
            <input
              id="startFrom"
              name="startFrom"
              type="time"
              dir="ltr"
              className="input text-start"
              defaultValue={values.startFrom}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="startTo">
              {t("fields.startTo")}
            </label>
            <input
              id="startTo"
              name="startTo"
              type="time"
              dir="ltr"
              className="input text-start"
              defaultValue={values.startTo}
              aria-invalid={Boolean(fieldErrors.startTo)}
            />
            {fieldError("startTo")}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("fields.timeWindowHint")}</p>
      </fieldset>

      <div>
        <label className="field-label" htmlFor="noteAr">
          {t("fields.noteAr")}
        </label>
        <input
          id="noteAr"
          name="noteAr"
          className="input"
          placeholder={t("fields.notePlaceholder")}
          defaultValue={values.noteAr}
          aria-invalid={Boolean(fieldErrors.noteAr)}
        />
        {fieldError("noteAr")}
      </div>

      <div>
        <label className="field-label" htmlFor="noteEn">
          {t("fields.noteEn")}
        </label>
        <input
          id="noteEn"
          name="noteEn"
          dir="ltr"
          className="input text-start"
          defaultValue={values.noteEn}
          aria-invalid={Boolean(fieldErrors.noteEn)}
        />
        {fieldError("noteEn")}
      </div>

      <div className="sm:w-40">
        <label className="field-label" htmlFor="displayOrder">
          {t("fields.displayOrder")}
        </label>
        <input
          id="displayOrder"
          name="displayOrder"
          type="number"
          className="input"
          defaultValue={values.displayOrder}
        />
        <p className="mt-1.5 text-sm text-muted-foreground">{t("fields.displayOrderHint")}</p>
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton label={submitLabel} pendingLabel={submittingLabel} />
    </form>
  );
}
