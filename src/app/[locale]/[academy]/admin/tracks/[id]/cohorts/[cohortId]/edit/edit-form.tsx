"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";
import { updateCohort, type EditCohortState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("cohortEdit");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

export function EditCohortForm({
  academySlug,
  trackId,
  cohortId,
  initial,
  teachers,
  durationWeeks,
  today,
}: {
  academySlug: string;
  trackId: string;
  cohortId: string;
  initial: {
    name: string;
    startDate: string;
    maxStudents: number | null;
    teacherId: string | null;
    status: string;
  };
  teachers: { id: string; name: string }[];
  durationWeeks: number;
  /* Today as the server saw it (YYYY-MM-DD), not as this browser sees it: the
     week number must be the same number the database computes, and a laptop
     an hour behind the academy would otherwise preview a different week. */
  today: string;
}) {
  const t = useTranslations("cohortEdit");
  const locale = useLocale();
  const [state, formAction] = useActionState<EditCohortState, FormData>(
    updateCohort,
    { error: null },
  );

  const [startDate, setStartDate] = useState(initial.startDate);

  /*
    The date's consequences, shown while she is choosing it.

    start_date decides two things at once and neither is obvious from a date
    picker: which week the cohort is in, and which weekday counts as "اليوم
    الأول". Printing both back as she types is what turns a silent mistake
    into an obvious one.
  */
  const preview = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    const start = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;

    const now = new Date(`${today}T00:00:00Z`);
    const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    if (days < 0) return { week: null, weekday: weekdayName(start, locale) };

    return {
      week: Math.min(Math.floor(days / 7) + 1, durationWeeks),
      weekday: weekdayName(start, locale),
    };
  })();

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="cohortId" value={cohortId} />

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
          defaultValue={initial.name}
          required
        />
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          {preview && (
            <p className="mt-1.5 rounded-lg bg-surface-muted px-2.5 py-2 text-xs leading-relaxed text-foreground/80">
              {preview.week
                ? t("preview", { week: preview.week, weekday: preview.weekday })
                : t("previewFuture", { weekday: preview.weekday })}
            </p>
          )}
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
            defaultValue={initial.maxStudents ?? ""}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("fields.capacityHint")}
          </p>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="teacherId">
          {t("fields.teacher")}
        </label>
        {/* The app's own combobox, not a native select: thirty-one معلمات is
            a list you search, and it is what every other teacher picker in
            the admin uses. The status below stays native — a fixed five. */}
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
          defaultValue={initial.teacherId ?? ""}
          placeholder={t("fields.teacherSearch")}
          noMatches={t("fields.teacherNoMatches")}
        />
      </div>

      {/* Radios, like the "new cohort" form beside it. Five fixed choices are
          worth seeing at once — and on a phone a dropdown is the one control
          that can close under the thumb mid-choice. */}
      <fieldset className="min-w-0">
        <legend className="field-label">{t("fields.status")}</legend>
        <div className="mt-1 flex flex-col gap-2">
          {(["draft", "registering", "running", "paused", "finished"] as const).map(
            (value) => (
              <label
                key={value}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border-subtle px-3 py-2.5"
              >
                <input
                  type="radio"
                  name="status"
                  value={value}
                  defaultChecked={value === initial.status}
                  className="accent-brand-600"
                />
                <span className="min-w-0 text-sm font-medium">
                  {t(`status.${value}`)}
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}

function weekdayName(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}
