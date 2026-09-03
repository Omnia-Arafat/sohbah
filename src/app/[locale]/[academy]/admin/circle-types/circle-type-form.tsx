"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { createCircleType, type CreateCircleTypeState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.circleTypes");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("adding") : t("add")}
    </button>
  );
}

export function CircleTypeForm({ academySlug }: { academySlug: string }) {
  const t = useTranslations("admin.circleTypes");
  const [state, formAction] = useActionState<CreateCircleTypeState, FormData>(
    createCircleType,
    { status: "idle" },
  );

  const values = state.status !== "idle" ? state.values : undefined;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="nameAr">
            {t("fields.nameAr")}
          </label>
          <input
            id="nameAr"
            name="nameAr"
            dir="rtl"
            className="input"
            defaultValue={values?.nameAr}
            aria-invalid={Boolean(fieldErrors.nameAr)}
          />
          {fieldErrors.nameAr && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.nameAr}`)}
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="nameEn">
            {t("fields.nameEn")}
          </label>
          <input
            id="nameEn"
            name="nameEn"
            dir="ltr"
            className="input text-start"
            defaultValue={values?.nameEn}
            aria-invalid={Boolean(fieldErrors.nameEn)}
          />
          {fieldErrors.nameEn && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.nameEn}`)}
            </p>
          )}
        </div>
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
