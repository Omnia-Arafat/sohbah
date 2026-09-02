"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { resetTeacherPassword, type ResetPasswordState } from "./actions";

function Submit({ confirmMessage }: { confirmMessage: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.teachers");

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-sm
                 disabled:opacity-50"
    >
      <KeyRound aria-hidden="true" className="h-4 w-4" />
      {pending ? t("resetting") : t("resetPassword")}
    </button>
  );
}

/**
 * Resets a teacher's password and shows the new one once.
 *
 * The password is displayed rather than emailed: these accounts have no real
 * address. The supervisor reads it off the screen and passes it on over
 * WhatsApp, which is how they already talk to their teachers.
 */
export function ResetPasswordButton({
  teacherId,
  teacherName,
  academySlug,
  locale,
}: {
  teacherId: string;
  teacherName: string;
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("admin.teachers");
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(
    resetTeacherPassword,
    { status: "idle" },
  );

  if (state.status === "done") {
    return (
      <div className="w-full rounded-xl border border-accent-300 bg-accent-100 p-3 dark:border-accent-700 dark:bg-accent-700/20">
        <p className="text-sm font-medium text-accent-700 dark:text-accent-200">
          {t("resetDone", { name: teacherName })}
        </p>
        <p
          dir="ltr"
          className="mt-2 select-all text-center font-mono text-lg font-bold tracking-widest"
        >
          {state.password}
        </p>
        <p className="mt-2 text-xs text-accent-700 dark:text-accent-200">
          {t("resetHint")}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="locale" value={locale} />
      <Submit confirmMessage={t("confirmReset", { name: teacherName })} />
      {state.status === "error" && (
        <p className="mt-1.5 text-sm text-absent">
          {t(`errors.${state.message}`)}
        </p>
      )}
    </form>
  );
}
