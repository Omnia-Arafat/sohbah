"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { CircleTypeOption } from "@/lib/database.types";
import { createCurriculum, type CurriculumFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.curricula");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("adding") : t("add")}
    </button>
  );
}

/**
 * The circle-type picker is the first field on purpose. It is what makes this
 * screen serve حلقة الحديث today and حلقة التجويد the day someone adds a
 * curriculum under that type — the form itself never learns either name.
 */
export function CurriculumForm({
  academySlug,
  circleTypes,
  locale,
}: {
  academySlug: string;
  circleTypes: CircleTypeOption[];
  locale: string;
}) {
  const t = useTranslations("admin.curricula");
  const [state, formAction] = useActionState<CurriculumFormState, FormData>(
    createCurriculum,
    { status: "idle" },
  );

  const values = state.status !== "idle" ? state.values : undefined;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  if (circleTypes.length === 0) {
    return <p className="card text-muted-foreground">{t("noTypes")}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />

      <div>
        <label className="field-label" htmlFor="circleType">
          {t("fields.circleType")}
        </label>
        <select
          id="circleType"
          name="circleType"
          className="input"
          defaultValue={values?.circleType ?? circleTypes[0]?.slug}
          aria-invalid={Boolean(fieldErrors.circleType)}
        >
          {circleTypes.map((type) => (
            <option key={type.id} value={type.slug}>
              {locale === "ar" ? type.name_ar : type.name_en}
            </option>
          ))}
        </select>
        {fieldErrors.circleType && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.circleType}`)}
          </p>
        )}
      </div>

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
            placeholder={t("placeholders.nameAr")}
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
            placeholder={t("placeholders.nameEn")}
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

      <div>
        <label className="field-label" htmlFor="description">
          {t("fields.description")}
        </label>
        <input
          id="description"
          name="description"
          className="input"
          defaultValue={values?.description}
        />
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
