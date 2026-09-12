"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addUnitMaterial, type MaterialState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.curricula.materials");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("uploading") : t("add")}
    </button>
  );
}

/**
 * Add a material: upload an image, or paste a link.
 *
 * Both in one form rather than two tabs, because from the معلمة's side it is
 * one intention — "put this in front of the students" — and which of the two
 * she used changes nothing about where it ends up.
 */
export function MaterialForm({
  academySlug,
  curriculumId,
  unitId,
}: {
  academySlug: string;
  curriculumId: string;
  unitId: string;
}) {
  const t = useTranslations("admin.curricula.materials");
  const [state, formAction] = useActionState<MaterialState, FormData>(
    addUnitMaterial,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="curriculumId" value={curriculumId} />
      <input type="hidden" name="unitId" value={unitId} />

      <div>
        <label className="field-label" htmlFor="materialTitle">
          {t("fields.title")}
        </label>
        <input
          id="materialTitle"
          name="title"
          className="input"
          placeholder={t("placeholders.title")}
        />
      </div>

      <div>
        <label className="field-label" htmlFor="materialFile">
          {t("fields.file")}
        </label>
        <input
          id="materialFile"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="input"
        />
        <p className="mt-1.5 text-sm text-muted-foreground">{t("fileHint")}</p>
      </div>

      <div>
        <label className="field-label" htmlFor="materialLink">
          {t("fields.link")}
        </label>
        <input
          id="materialLink"
          name="link"
          type="url"
          dir="ltr"
          className="input text-start"
          placeholder="https://…"
        />
        <p className="mt-1.5 text-sm text-muted-foreground">{t("linkHint")}</p>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
