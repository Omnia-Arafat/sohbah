"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { CurriculumUnit } from "@/lib/database.types";
import { createUnit, updateUnit, type UnitFormState } from "./actions";

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.curricula.units");
  const label = mode === "create" ? t("add") : t("save");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

/**
 * One form for both adding and editing a unit.
 *
 * The narrator / source / grade fields sit in their own collapsible section
 * labelled as the Hadith fields: a معلمة entering a باب من متن التجويد should
 * not have four blank boxes she has no answer for staring at her, but a معلمة
 * entering a حديث must have them one tap away.
 */
export function UnitForm({
  academySlug,
  curriculumId,
  unit,
}: {
  academySlug: string;
  curriculumId: string;
  unit?: CurriculumUnit;
}) {
  const t = useTranslations("admin.curricula.units");
  const mode = unit ? "edit" : "create";
  const [state, formAction] = useActionState<UnitFormState, FormData>(
    unit ? updateUnit : createUnit,
    { status: "idle" },
  );

  const submitted = state.status !== "idle" ? state.values : undefined;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  // A failed submit shows what she typed; a fresh render shows the stored row.
  const initial = {
    titleAr: submitted?.titleAr ?? unit?.title_ar ?? "",
    titleEn: submitted?.titleEn ?? unit?.title_en ?? "",
    body: submitted?.body ?? unit?.body ?? "",
    explanation: submitted?.explanation ?? unit?.explanation ?? "",
    narrator: submitted?.narrator ?? unit?.narrator ?? "",
    sourceBook: submitted?.sourceBook ?? unit?.source_book ?? "",
    sourceRef: submitted?.sourceRef ?? unit?.source_ref ?? "",
    grade: submitted?.grade ?? unit?.grade ?? "",
  };

  const hasHadithFields = Boolean(
    initial.narrator || initial.sourceBook || initial.sourceRef || initial.grade,
  );

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="curriculumId" value={curriculumId} />
      {unit && <input type="hidden" name="unitId" value={unit.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="titleAr">
            {t("fields.titleAr")}
          </label>
          <input
            id="titleAr"
            name="titleAr"
            dir="rtl"
            className="input"
            placeholder={t("placeholders.titleAr")}
            defaultValue={initial.titleAr}
            aria-invalid={Boolean(fieldErrors.titleAr)}
          />
          {fieldErrors.titleAr && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.titleAr}`)}
            </p>
          )}
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
            placeholder={t("placeholders.titleEn")}
            defaultValue={initial.titleEn}
            aria-invalid={Boolean(fieldErrors.titleEn)}
          />
          {fieldErrors.titleEn && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.titleEn}`)}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="body">
          {t("fields.body")}
        </label>
        <textarea
          id="body"
          name="body"
          dir="rtl"
          rows={4}
          className="input"
          placeholder={t("placeholders.body")}
          defaultValue={initial.body}
        />
      </div>

      <div>
        <label className="field-label" htmlFor="explanation">
          {t("fields.explanation")}
        </label>
        <textarea
          id="explanation"
          name="explanation"
          dir="rtl"
          rows={3}
          className="input"
          defaultValue={initial.explanation}
        />
      </div>

      <details open={hasHadithFields} className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {t("hadithSection")}
        </summary>
        <p className="mt-1 text-sm text-muted-foreground">{t("hadithHint")}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="narrator">
              {t("fields.narrator")}
            </label>
            <input
              id="narrator"
              name="narrator"
              dir="rtl"
              className="input"
              placeholder={t("placeholders.narrator")}
              defaultValue={initial.narrator}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="sourceBook">
              {t("fields.sourceBook")}
            </label>
            <input
              id="sourceBook"
              name="sourceBook"
              dir="rtl"
              className="input"
              placeholder={t("placeholders.sourceBook")}
              defaultValue={initial.sourceBook}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="sourceRef">
              {t("fields.sourceRef")}
            </label>
            <input
              id="sourceRef"
              name="sourceRef"
              dir="rtl"
              className="input"
              placeholder={t("placeholders.sourceRef")}
              defaultValue={initial.sourceRef}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="grade">
              {t("fields.grade")}
            </label>
            <input
              id="grade"
              name="grade"
              dir="rtl"
              className="input"
              placeholder={t("placeholders.grade")}
              defaultValue={initial.grade}
            />
          </div>
        </div>
      </details>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton mode={mode} />
    </form>
  );
}
