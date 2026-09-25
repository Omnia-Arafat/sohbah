"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BrandSelect } from "@/components/brand-select";
import type { CircleTypeOption, Curriculum } from "@/lib/database.types";
import { createQuiz, type QuizFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.quizzes");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("creating") : t("create")}
    </button>
  );
}

export type QuizScopeCircle = {
  id: string;
  name: string;
  type: string;
  teacherName: string;
};

/**
 * The cascading scope picker.
 *
 *   نوع الحلقة  →  المنهج  →  الحلقة
 *
 * Choosing the type narrows the two below it, client-side: every curriculum
 * and every circle of the academy is already on the page, so changing the type
 * re-filters instantly instead of making a round trip. These lists are small —
 * a few curricula and a few dozen circles.
 *
 * Nothing here knows the word "hadith". Choosing تجويد in the first field is
 * the whole of what it takes for this screen to serve حلقات التجويد.
 */
export function QuizForm({
  academySlug,
  circleTypes,
  curricula,
  circles,
  locale,
}: {
  academySlug: string;
  circleTypes: CircleTypeOption[];
  curricula: Curriculum[];
  circles: QuizScopeCircle[];
  locale: string;
}) {
  const t = useTranslations("admin.quizzes");
  const [state, formAction] = useActionState<QuizFormState, FormData>(createQuiz, {
    status: "idle",
  });

  const values = state.status !== "idle" ? state.values : undefined;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  const [circleType, setCircleType] = useState(
    values?.circleType ?? circleTypes[0]?.slug ?? "",
  );

  const scopedCurricula = useMemo(
    () => curricula.filter((c) => c.circle_type === circleType),
    [curricula, circleType],
  );
  const scopedCircles = useMemo(
    () => circles.filter((c) => c.type === circleType),
    [circles, circleType],
  );

  if (circleTypes.length === 0) {
    return <p className="card text-muted-foreground">{t("noTypes")}</p>;
  }

  return (
    <form action={formAction} className="card flex flex-col gap-4" noValidate>
      <input type="hidden" name="academySlug" value={academySlug} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="circleType">
            {t("fields.circleType")}
          </label>
          <BrandSelect
            id="circleType"
            name="circleType"
            value={circleType}
            onValueChange={setCircleType}
            invalid={Boolean(fieldErrors.circleType)}
            options={circleTypes.map((type) => ({
              value: type.slug,
              label: locale === "ar" ? type.name_ar : type.name_en,
            }))}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="curriculumId">
            {t("fields.curriculum")}
          </label>
          <BrandSelect
            id="curriculumId"
            name="curriculumId"
            defaultValue={values?.curriculumId ?? ""}
            key={`cur-${circleType}`}
            options={[
              { value: "", label: t("anyCurriculum") },
              ...scopedCurricula.map((curriculum) => ({
                value: curriculum.id,
                label: locale === "ar" ? curriculum.name_ar : curriculum.name_en,
              })),
            ]}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="circleId">
            {t("fields.circle")}
          </label>
          <BrandSelect
            id="circleId"
            name="circleId"
            defaultValue={values?.circleId ?? ""}
            key={`cir-${circleType}`}
            options={[
              // The default. An empty value means "every circle of this type",
              // which is how one quiz covers all the حلقات حديث at once rather
              // than being written out per circle.
              {
                value: "",
                label: t("allCirclesOfType", { count: String(scopedCircles.length) }),
              },
              ...scopedCircles.map((circle) => ({
                value: circle.id,
                label: `${circle.name} — ${circle.teacherName}`,
              })),
            ]}
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="title">
          {t("fields.title")}
        </label>
        <input
          id="title"
          name="title"
          className="input"
          placeholder={t("placeholders.title")}
          defaultValue={values?.title}
          aria-invalid={Boolean(fieldErrors.title)}
        />
        {fieldErrors.title && (
          <p className="mt-1.5 text-sm text-absent">{t(`errors.${fieldErrors.title}`)}</p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="instructions">
          {t("fields.instructions")}
        </label>
        <input
          id="instructions"
          name="instructions"
          className="input"
          defaultValue={values?.instructions}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="durationMinutes">
            {t("fields.duration")}
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={1}
            max={480}
            className="input"
            placeholder={t("placeholders.duration")}
            defaultValue={values?.durationMinutes}
            aria-invalid={Boolean(fieldErrors.durationMinutes)}
          />
          {fieldErrors.durationMinutes && (
            <p className="mt-1.5 text-sm text-absent">
              {t(`errors.${fieldErrors.durationMinutes}`)}
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="maxAttempts">
            {t("fields.maxAttempts")}
          </label>
          <input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={10}
            className="input"
            defaultValue={values?.maxAttempts ?? "1"}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="passScore">
            {t("fields.passScore")}
          </label>
          <input
            id="passScore"
            name="passScore"
            type="number"
            min={0}
            max={100}
            className="input"
            defaultValue={values?.passScore ?? "50"}
          />
        </div>
      </div>

      {state.status === "failed" && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
