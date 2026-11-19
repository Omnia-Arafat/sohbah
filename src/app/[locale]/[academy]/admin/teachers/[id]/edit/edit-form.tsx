"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PhoneField } from "@/components/phone-field";
import { parseE164 } from "@/lib/phone";
import { updateTeacher, type UpdateTeacherState } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.teachers");
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("saving") : t("saveChanges")}
    </button>
  );
}

type TeacherValues = {
  id: string;
  name: string;
  phone: string | null;
  gender_category: string;
  role: string;
};

export function EditTeacherForm({
  teacher,
  academySlug,
}: {
  teacher: TeacherValues;
  academySlug: string;
}) {
  const locale = useLocale();
  const t = useTranslations("admin.teachers");
  const tDashboard = useTranslations("dashboard");
  const [state, formAction] = useActionState<UpdateTeacherState, FormData>(
    updateTeacher,
    { status: "idle" },
  );

  const values = state.status === "invalid" ? state.values : {
    name: teacher.name,
    phone: teacher.phone ?? "",
    phoneCountry: "",
    gender: teacher.gender_category,
    role: teacher.role,
  };
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  /**
   * A rejected save comes back as typed; otherwise the stored number is split
   * into picker + digits. A legacy number we cannot place gets a null country
   * and the picker opens on Egypt for the مشرفة to correct.
   */
  const storedPhone =
    state.status === "invalid"
      ? { iso: values.phoneCountry, national: values.phone }
      : parseE164(teacher.phone);

  /** The action returns message keys, not sentences, so it stays locale-free. */
  function fieldError(key: string) {
    const error = fieldErrors[key];
    if (!error) return null;
    return <p className="mt-1.5 text-sm text-absent">{t(`errors.${error}`)}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5" noValidate>
      <input type="hidden" name="teacherId" value={teacher.id} />
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label className="field-label" htmlFor="name">
          {t("fields.name")}
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

      <PhoneField
        label={t("fields.phone")}
        error={fieldErrors.phone ? t(`errors.${fieldErrors.phone}`) : undefined}
        defaultCountry={storedPhone.iso}
        defaultValue={storedPhone.national}
      />

      {/* Same two-card control the application form uses. Promoting to مشرفة
          grants full admin access, so it is a deliberate choice here. */}
      <fieldset>
        <legend className="field-label">{t("fields.role")}</legend>
        <div className="flex gap-3">
          {(["teacher", "admin"] as const).map((option) => (
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
                name="role"
                value={option}
                defaultChecked={values.role === option}
                className="accent-brand-600"
              />
              {t(`roles.${option}`)}
            </label>
          ))}
        </div>
        {fieldError("role")}
      </fieldset>

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
                defaultChecked={values.gender === option}
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

      <div className="flex gap-3">
        <Link
          href={`/${academySlug}/admin/teachers`}
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
