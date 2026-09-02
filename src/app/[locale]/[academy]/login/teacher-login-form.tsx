"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { PasswordField } from "@/components/password-field";
import { teacherSignIn } from "./teacher-actions";
import {
  initialTeacherLoginState,
  type TeacherLoginState,
} from "./teacher-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("auth");
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("submitting") : t("submit")}
    </button>
  );
}

export function TeacherLoginForm({
  academySlug,
  next,
}: {
  academySlug: string;
  next: string | null;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState<TeacherLoginState, FormData>(
    teacherSignIn,
    initialTeacherLoginState,
  );

  const values = state.status === "idle" ? undefined : state.values;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label className="field-label" htmlFor="phone">
          {t("fields.phone")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          className="input text-start"
          defaultValue={values?.phone}
          autoComplete="tel"
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        {fieldErrors.phone && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.phone}`)}
          </p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          {t("fields.password")}
        </label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.password}`)}
          </p>
        )}
      </div>

      {state.status === "failed" && (
        <p className="rounded-xl border border-absent/40 bg-absent/10 p-3 text-sm text-absent">
          {t(`errors.${state.reason}`)}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
