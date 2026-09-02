"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BookOpen, ShieldCheck } from "lucide-react";
import { PasswordField } from "@/components/password-field";
import { applyAsTeacher } from "./actions";
import {
  initialTeacherApplicationState,
  type TeacherApplicationState,
} from "./state";

const ROLES = ["teacher", "admin"] as const;

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Sized to match `StudentIcon` on the student form, so the two cards match. */
function RoleIcon({ role }: { role: (typeof ROLES)[number] }) {
  const Icon = role === "teacher" ? BookOpen : ShieldCheck;
  return <Icon aria-hidden="true" className="h-8 w-8 shrink-0" strokeWidth={1.5} />;
}

export function TeacherApplicationForm({
  academyId,
  academySlug,
}: {
  academyId: string;
  academySlug: string;
}) {
  const t = useTranslations("registerTeacher");
  const [state, formAction] = useActionState<TeacherApplicationState, FormData>(
    applyAsTeacher,
    initialTeacherApplicationState,
  );

  if (state.status === "success") {
    return (
      <div className="card border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <h2 className="font-display text-xl font-bold">{t("success.title")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t("success.body", { name: state.name })}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("success.nextStep")}
        </p>
      </div>
    );
  }

  const values =
    state.status === "invalid" || state.status === "failed"
      ? state.values
      : undefined;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academyId" value={academyId} />
      <input type="hidden" name="academySlug" value={academySlug} />

      {state.status === "failed" && (
        <p className="rounded-xl border border-absent/40 bg-absent/10 p-3 text-sm text-absent">
          {t(`errors.${state.reason}`)}
        </p>
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
          autoComplete="name"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        {fieldErrors.name && (
          <p id="name-error" className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.name}`)}
          </p>
        )}
      </div>

      {/* Same two-card control the student form uses for the section, carrying
          the role instead. */}
      <fieldset>
        <legend className="field-label">{t("fields.role")}</legend>
        <div className="flex gap-3">
          {ROLES.map((option) => (
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
                defaultChecked={values?.role === option}
                className="accent-brand-600"
              />
              <RoleIcon role={option} />
              {t(`roles.${option}`)}
            </label>
          ))}
        </div>
        {fieldErrors.role && (
          <p className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.role}`)}
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

      <div>
        <label className="field-label" htmlFor="password">
          {t("fields.password")}
        </label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          invalid={Boolean(fieldErrors.password)}
          describedBy={fieldErrors.password ? "password-error" : "password-hint"}
        />
        {fieldErrors.password ? (
          <p id="password-error" className="mt-1.5 text-sm text-absent">
            {t(`errors.${fieldErrors.password}`)}
          </p>
        ) : (
          <p id="password-hint" className="mt-1.5 text-sm text-muted-foreground">
            {t("fields.passwordHint")}
          </p>
        )}
      </div>

      <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />

      <p className="text-sm text-muted-foreground">{t("approvalNotice")}</p>
    </form>
  );
}
