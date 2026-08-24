"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { signIn } from "./actions";
import { initialLoginState, type LoginState } from "./state";

function SubmitButton() {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("submitting") : t("submit")}
    </button>
  );
}

export function LoginForm({ academySlug, next }: { academySlug: string; next: string | null }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState<LoginState, FormData>(
    signIn,
    initialLoginState,
  );

  const email = state.status === "idle" ? "" : state.email;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label className="field-label" htmlFor="email">
          {t("fields.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          dir="ltr"
          className="input text-start"
          defaultValue={email}
          autoComplete="email"
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.email}`)}
          </p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          {t("fields.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          className="input text-start"
          autoComplete="current-password"
          aria-invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.password}`)}
          </p>
        )}
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
