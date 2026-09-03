"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updateCircleType, type UpdateCircleTypeState } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.circleTypes");
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("saving") : t("saveChanges")}
    </button>
  );
}

export function EditCircleTypeForm({
  type,
  academySlug,
}: {
  type: { id: string; name_ar: string; name_en: string };
  academySlug: string;
}) {
  const t = useTranslations("admin.circleTypes");
  const [state, formAction] = useActionState<UpdateCircleTypeState, FormData>(
    updateCircleType,
    { status: "idle" },
  );

  const values =
    state.status === "invalid"
      ? state.values
      : { nameAr: type.name_ar, nameEn: type.name_en };
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="typeId" value={type.id} />
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
            defaultValue={values.nameAr}
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
            defaultValue={values.nameEn}
            aria-invalid={Boolean(fieldErrors.nameEn)}
          />
          {fieldErrors.nameEn && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.nameEn}`)}
            </p>
          )}
        </div>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-absent">{t(`errors.${state.message}`)}</p>
      )}

      <div className="flex gap-3">
        <Link
          href={`/${academySlug}/admin/circle-types`}
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
