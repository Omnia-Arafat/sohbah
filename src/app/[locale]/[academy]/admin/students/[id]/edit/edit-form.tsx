"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updateStudent, type UpdateStudentState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.students");

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("saving") : t("saveChanges")}
    </button>
  );
}

type Student = {
  id: string;
  name: string;
  father_name: string;
  phone: string | null;
  gender_category: string;
};

type EditStudentFormProps = {
  student: Student;
  academySlug: string;
};

export function EditStudentForm({ student, academySlug }: EditStudentFormProps) {
  const locale = useLocale();
  const t = useTranslations("admin.students");
  const tDashboard = useTranslations("dashboard");
  const [state, formAction] = useActionState<UpdateStudentState, FormData>(
    updateStudent,
    { status: "idle" },
  );

  const values =
    state.status === "invalid" ? state.values : student;
  const fieldErrors =
    state.status === "invalid" ? state.fieldErrors : {};

  /** The action returns message keys, not sentences, so it stays locale-free. */
  function fieldError(key: string) {
    const error = fieldErrors[key];
    if (!error) return null;
    return (
      <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>
    );
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5" noValidate>
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label className="field-label" htmlFor="name">
          {t("studentName")}
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
        <label className="field-label" htmlFor="father_name">
          {t("fatherName")}
        </label>
        <input
          id="father_name"
          name="father_name"
          className="input"
          defaultValue={values.father_name}
          required
          aria-invalid={Boolean(fieldErrors.father_name)}
        />
        {fieldError("father_name")}
      </div>

      <div>
        <label className="field-label" htmlFor="phone">
          {t("phoneNumber")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
          className="input text-start"
          defaultValue={values.phone || ""}
          autoComplete="tel"
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        {fieldError("phone")}
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

      {state.status === "error" && (
        <p className="text-sm text-absent">{t(`errors.${state.message}`)}</p>
      )}

      {state.status === "success" && (
        <p className="text-sm text-green-600 dark:text-green-400">
          {t("saved")}
        </p>
      )}

      <div className="flex gap-3">
        <Link
          href={`/${academySlug}/admin/students`}
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
