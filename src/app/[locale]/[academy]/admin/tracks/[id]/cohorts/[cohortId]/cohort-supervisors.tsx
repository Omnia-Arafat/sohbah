"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ShieldCheck, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmButton } from "@/components/confirm-button";
import { SearchableSelect } from "@/components/searchable-select";
import type { CohortSupervisors } from "@/lib/cohort-supervisors";
import {
  assignCohortSupervisor,
  removeCohortSupervisor,
  type SupervisorState,
} from "./supervisor-actions";

function Submit({ disabled }: { disabled: boolean }) {
  const t = useTranslations("cohortSupervisors");
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-4 disabled:opacity-50"
    >
      <ShieldCheck aria-hidden="true" className="h-4 w-4" />
      {pending ? t("assigning") : t("assign")}
    </button>
  );
}

/**
 * مشرفات الدفعة: who supervises this دفعة, and adding more.
 *
 * Picking someone who does not hold the مشرفة role yet — a معلمة, or a
 * student — gives it to her first; the server refuses that to anyone but an
 * admin. A student without a staff account gets one, and its temporary
 * password is shown here once.
 */
export function CohortSupervisorsCard({
  academySlug,
  trackId,
  cohortId,
  supervisors,
}: {
  academySlug: string;
  trackId: string;
  cohortId: string;
  supervisors: CohortSupervisors;
}) {
  const t = useTranslations("cohortSupervisors");
  const [state, formAction] = useActionState<SupervisorState, FormData>(
    assignCohortSupervisor,
    { status: "idle" },
  );
  const [choice, setChoice] = useState("");
  // A fresh, empty picker after every success.
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "done") {
      setChoice("");
      setRound((n) => n + 1);
    }
  }

  const picked = supervisors.candidates.find((c) => c.value === choice);

  return (
    <section className="card flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {supervisors.assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {supervisors.assigned.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                <span className="truncate font-medium">{person.name}</span>
              </span>
              <form action={removeCohortSupervisor}>
                <input type="hidden" name="academySlug" value={academySlug} />
                <input type="hidden" name="trackId" value={trackId} />
                <input type="hidden" name="cohortId" value={cohortId} />
                <input type="hidden" name="teacherId" value={person.id} />
                <ConfirmButton
                  label={t("remove", { name: person.name })}
                  title={t("remove", { name: person.name })}
                  confirmMessage={t("confirmRemove", { name: person.name })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-absent"
                >
                  <UserMinus aria-hidden="true" className="h-4 w-4" />
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="academySlug" value={academySlug} />
        <input type="hidden" name="trackId" value={trackId} />
        <input type="hidden" name="cohortId" value={cohortId} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              key={round}
              id="cohort-supervisor"
              name="candidate"
              options={supervisors.candidates.map((c) => ({
                value: c.value,
                label: c.kind === "supervisor" ? c.name : `${c.name} · ${t(`kind.${c.kind}`)}`,
              }))}
              placeholder={t("placeholder")}
              noMatches={t("noMatches")}
              onValueChange={setChoice}
            />
          </div>
          <Submit disabled={!choice} />
        </div>
        {picked && picked.kind !== "supervisor" && (
          <p className="text-xs text-accent-700 dark:text-accent-300">
            {t(`willGrant.${picked.kind}`, { name: picked.name })}
          </p>
        )}
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-absent">
          {t(`errors.${state.message}`, { name: state.staffName ?? "" })}
        </p>
      )}

      {state.status === "done" && !state.password && (
        <p role="status" className="text-sm text-present">
          {t("assigned", { name: state.name })}
        </p>
      )}

      {state.status === "done" && state.password && (
        <div className="rounded-xl border border-accent-300 bg-accent-100 p-3 dark:border-accent-700 dark:bg-accent-700/20">
          <p className="text-sm font-medium text-accent-700 dark:text-accent-200">
            {t("accountCreated", { name: state.name })}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("signInPhone")}</dt>
            <dd dir="ltr" className="select-all font-mono">{state.phone}</dd>
            <dt className="text-muted-foreground">{t("signInPassword")}</dt>
            <dd dir="ltr" className="select-all font-mono text-lg font-bold tracking-widest">
              {state.password}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-accent-700 dark:text-accent-200">{t("passwordOnce")}</p>
        </div>
      )}
    </section>
  );
}
