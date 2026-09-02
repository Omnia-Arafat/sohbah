"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { registerStudent } from "./actions";
import { initialRegisterState, type RegisterState } from "./state";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function StudentIcon({ gender }: { gender: "male" | "female" }) {
  if (gender === "male") {
    return (
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="h-8 w-8 shrink-0 fill-current"
      >
        <path d="M14.2 17.3c.4-7.1 4.2-11.1 10.3-11.1 5.8 0 9.4 3.7 9.4 10.3 0 1.2-.1 2.2-.3 3.2-1.7-3.2-4.3-5.4-7.8-6.5-2.6 2.6-6.5 4.1-11.6 4.1Z" />
        <path d="M15.3 18.7c.6 6.4 4.1 10.8 9.2 10.8 5 0 8.5-4.2 9.1-10.4-3.1-1-5.8-2.5-8-4.6-2.7 2.3-6.1 3.7-10.3 4.2Z" />
        <path d="M7.5 43c.7-7.6 5.4-12 12.5-13.3 1.2 1.5 2.7 2.3 4.5 2.3s3.3-.8 4.5-2.3C36.1 31 40.8 35.4 41.5 43h-34Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="h-8 w-8 shrink-0 fill-current"
    >
      <path d="M11.5 29.8c2.1-2.4 2.7-5.4 2.7-9.7 0-8.7 4-14.1 10.3-14.1s10.3 5.4 10.3 14.1c0 4.3.6 7.3 2.7 9.7-2.6 1.2-5.2 1.4-7.7.7a10.3 10.3 0 0 1-10.6 0c-2.5.7-5.1.5-7.7-.7Z" />
      <path
        d="M18.1 18.1c.8 6.3 3 9.5 6.4 9.5 3.5 0 5.7-3.2 6.4-9.5-2.8-.8-5-2.2-6.4-4.3-1.4 2.1-3.6 3.5-6.4 4.3Z"
        className="fill-surface"
      />
      <path d="M7.5 43c.7-7.5 5.1-11.8 12.1-13.2 1.3 1.4 2.9 2.2 4.9 2.2s3.6-.8 4.9-2.2C36.4 31.2 40.8 35.5 41.5 43h-34Z" />
    </svg>
  );
}

export function RegisterForm({
  academyId,
  academySlug,
  circleSlug,
}: {
  academyId: string;
  academySlug: string;
  circleSlug: string | null;
}) {
  const t = useTranslations("register");
  const [state, formAction] = useActionState<RegisterState, FormData>(
    registerStudent,
    initialRegisterState,
  );

  if (state.status === "success") {
    return (
      <div className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <h2 className="text-xl font-semibold">{t("success.title")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t("success.body", { name: state.name })}
        </p>
        {state.circleSlug ? (
          <Link
            href={`/${academySlug}/circle/${state.circleSlug}`}
            className="btn-primary mt-4 w-full sm:w-auto"
          >
            {t("success.backToCircle")}
          </Link>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("success.nextStep")}
          </p>
        )}
      </div>
    );
  }

  const values = state.status === "idle" ? null : state.values;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const isDuplicate = state.status === "duplicate";

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academyId" value={academyId} />
      {circleSlug && (
        <input type="hidden" name="circleSlug" value={circleSlug} />
      )}

      <div>
        <label className="field-label" htmlFor="name">
          {t("fields.name")}
        </label>
        <input
          id="name"
          name="name"
          className="input"
          defaultValue={values?.name}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        {fieldErrors.name && (
          <p id="name-error" className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.name}`)}
          </p>
        )}
      </div>

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
                defaultChecked={values?.gender === option}
                className="accent-brand-600"
              />
              <StudentIcon gender={option} />
              {t(`fields.${option}`)}
            </label>
          ))}
        </div>
        {fieldErrors.gender && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.gender}`)}
          </p>
        )}
      </fieldset>

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
          required
          className="input text-start"
          defaultValue={values?.phone}
          autoComplete="tel"
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? "phone-error" : "phone-hint"}
        />
        {fieldErrors.phone ? (
          <p id="phone-error" className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.phone}`)}
          </p>
        ) : (
          <p id="phone-hint" className="mt-1.5 text-sm text-muted-foreground">
            {t("fields.phoneHint")}
          </p>
        )}
      </div>

      {isDuplicate && (
        <div className="rounded-xl border border-accent-300 bg-accent-100 p-4 text-accent-700">
          <p className="font-semibold">{t("duplicate.title")}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
            {state.matches.map((match) => (
              <li key={match.id}>
                {match.name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">{t("duplicate.body")}</p>
        </div>
      )}

      {state.status === "failed" && (
        <p className="text-sm text-absent">
          {t(`errors.${state.reason}`)}
        </p>
      )}

      {isDuplicate ? (
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            name="confirmDuplicate"
            value="1"
            className="btn-secondary w-full"
          >
            {t("duplicate.confirm")}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {t("duplicate.hint")}
          </p>
        </div>
      ) : (
        <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
      )}
    </form>
  );
}
