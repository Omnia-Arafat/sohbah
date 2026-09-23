"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";
import { createCohort, type CohortFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("cohortNew");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

export function CohortForm({
  academySlug,
  trackId,
  defaultCapacity,
  teachers,
}: {
  academySlug: string;
  trackId: string;
  defaultCapacity: number;
  teachers: { id: string; name: string }[];
}) {
  const t = useTranslations("cohortNew");
  const [state, formAction] = useActionState<CohortFormState, FormData>(
    createCohort,
    { error: null },
  );

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="trackId" value={trackId} />

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-absent/40 bg-absent/5 px-3 py-2.5 text-sm text-absent"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="name">
          {t("fields.name")}
        </label>
        <input
          id="name"
          name="name"
          dir="rtl"
          className="input"
          placeholder={t("fields.namePlaceholder")}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("fields.nameHint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="startDate">
            {t("fields.startDate")}
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            className="input"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("fields.startHint")}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="maxStudents">
            {t("fields.capacity")}
          </label>
          <input
            id="maxStudents"
            name="maxStudents"
            type="number"
            min={1}
            className="input"
            defaultValue={defaultCapacity}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("fields.capacityHint", { n: defaultCapacity })}
          </p>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="teacherId">
          {t("fields.teacher")}
        </label>
        {/* Same combobox as every other teacher picker in the admin. */}
        <SearchableSelect
          id="teacherId"
          name="teacherId"
          options={[
            { value: "", label: t("fields.teacherNone") },
            ...teachers.map((teacher) => ({
              value: teacher.id,
              label: teacher.name,
            })),
          ]}
          defaultValue=""
          placeholder={t("fields.teacherSearch")}
          noMatches={t("fields.teacherNoMatches")}
        />
      </div>

      <fieldset className="min-w-0">
        <legend className="field-label">{t("fields.status")}</legend>
        <div className="mt-1 flex flex-col gap-2">
          {(["draft", "registering", "running"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 items-start gap-2.5 rounded-xl border border-border-subtle px-3 py-2.5"
            >
              <input
                type="radio"
                name="status"
                value={value}
                defaultChecked={value === "draft"}
                className="mt-0.5 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t(`status.${value}`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`statusHint.${value}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
