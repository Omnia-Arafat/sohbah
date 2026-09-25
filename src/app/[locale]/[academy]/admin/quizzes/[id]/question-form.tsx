"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BrandSelect } from "@/components/brand-select";
import { Link } from "@/i18n/navigation";
import type { CurriculumUnit, QuestionKind } from "@/lib/database.types";
import { addQuestion, updateQuestion, type QuestionFormState } from "./actions";
import { validateQuestion, type QuestionError } from "./validate-question";

const OPTION_SLOTS = 4;

/** A question as it stands, for editing. */
export type EditableQuestion = {
  id: string;
  kind: QuestionKind;
  unitId: string | null;
  prompt: string;
  points: number;
  options: { id: string; text: string; is_correct: boolean }[];
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.quizzes.questions");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {editing ? (pending ? t("saving") : t("save")) : pending ? t("adding") : t("add")}
    </button>
  );
}

/**
 * Writing one question, or editing one already written.
 *
 * The kind picker changes what the rest of the form asks for, because the five
 * kinds genuinely need different things: a choice question needs options and a
 * correct one; a fill-in needs the accepted spellings; a written answer needs
 * nothing but the prompt, since a معلمة will mark it herself.
 *
 * Editing keeps the kind fixed — the answers already saved were given to that
 * kind — and carries each option's id so the server rewords it in place.
 */
export function QuestionForm({
  academySlug,
  quizId,
  units,
  locale,
  question,
  onSaved,
  onCancel,
}: {
  academySlug: string;
  quizId: string;
  units: CurriculumUnit[];
  locale: string;
  question?: EditableQuestion;
  onSaved?: (regraded: number) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("admin.quizzes.questions");
  const editing = Boolean(question);
  const [state, formAction] = useActionState<QuestionFormState, FormData>(
    editing ? updateQuestion : addQuestion,
    { status: "idle" },
  );

  const [kind, setKind] = useState<QuestionKind>(question?.kind ?? "mcq");
  const [clientError, setClientError] = useState<QuestionError | null>(null);
  // Several of these forms can be open on one page; ids must not collide.
  const uid = useId();

  useEffect(() => {
    if (state.status === "saved") onSaved?.(state.regraded);
  }, [state, onSaved]);

  // After a failed save the server hands back what she typed. React resets a
  // form once its action finishes, and it resets to these defaults — so the
  // question comes back filled in rather than wiped.
  const failed = state.status === "invalid" || state.status === "failed" ? state : null;
  const values = failed?.values ?? (question ? fromQuestion(question) : undefined);
  const error = clientError ?? failed?.reason ?? null;

  const needsOptions = kind === "mcq" || kind === "multi" || kind === "true_false";
  const isFillBlank = kind === "fill_blank";
  const multiple = kind === "multi";
  // True/false is a choice question with its two options written for her.
  const defaults = kind === "true_false" ? [t("true"), t("false")] : [];
  const slots =
    kind === "true_false" ? 2 : Math.max(OPTION_SLOTS, (question?.options.length ?? 0) + 1);

  return (
    <form
      action={formAction}
      // Checked here first: a half-written question never leaves the browser,
      // so nothing is submitted and nothing she typed is cleared.
      onSubmit={(event) => {
        const problem = validateQuestion(new FormData(event.currentTarget));
        setClientError(problem);
        if (problem) event.preventDefault();
      }}
      // Remounting on kind change clears option boxes that no longer apply,
      // so a leftover answer from a previous kind cannot be submitted.
      key={kind}
      className="card flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="kind" value={kind} />
      {question && <input type="hidden" name="questionId" value={question.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`${uid}-kind`}>
            {t("fields.kind")}
          </label>
          {editing ? (
            <p id={`${uid}-kind`} className="input bg-surface-muted text-muted-foreground">
              {t(`kinds.${kind}`)}
            </p>
          ) : (
            <BrandSelect
              id={`${uid}-kind`}
              value={kind}
              onValueChange={(value) => setKind(value as QuestionKind)}
              options={(["mcq", "true_false", "multi", "fill_blank", "short_text"] as const).map(
                (value) => ({ value, label: t(`kinds.${value}`) }),
              )}
            />
          )}
        </div>

        <div>
          <label className="field-label" htmlFor={`${uid}-unit`}>
            {t("fields.unit")}
          </label>
          {units.length === 0 ? (
            // No curriculum for this circle type means no lessons to tag — say
            // so and point at where one is added, instead of a list whose only
            // row is "not linked".
            <p className="rounded-xl bg-surface-muted p-3 text-sm leading-relaxed text-muted-foreground">
              {t("noUnits")}{" "}
              <Link
                href={`/${academySlug}/admin/curricula`}
                className="font-semibold text-brand-700 underline dark:text-brand-300"
              >
                {t("addCurriculum")}
              </Link>
            </p>
          ) : (
            <BrandSelect
              id={`${uid}-unit`}
              name="unitId"
              defaultValue={values?.unitId ?? ""}
              options={[
                { value: "", label: t("noUnit") },
                ...units.map((unit) => ({
                  value: unit.id,
                  label: `${unit.position}. ${locale === "ar" ? unit.title_ar : unit.title_en}`,
                })),
              ]}
            />
          )}
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor={`${uid}-prompt`}>
          {t("fields.prompt")}
        </label>
        <textarea
          id={`${uid}-prompt`}
          name="prompt"
          rows={2}
          dir="rtl"
          className="input"
          placeholder={t("placeholders.prompt")}
          defaultValue={values?.prompt ?? ""}
        />
      </div>

      {(needsOptions || isFillBlank) && (
        <fieldset className="rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-medium">
            {isFillBlank ? t("acceptedAnswers") : t("options")}
          </legend>
          <p className="mb-3 text-sm text-muted-foreground">
            {isFillBlank ? t("acceptedHint") : t("optionsHint")}
          </p>

          <div className="flex flex-col gap-2">
            {Array.from({ length: slots }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <input type="hidden" name="optionId" value={question?.options[index]?.id ?? ""} />
                {needsOptions && (
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    // A radio group needs one shared name; the value carries
                    // the row index so the server can line it up with the text.
                    name="optionCorrect"
                    value={String(index)}
                    aria-label={t("markCorrect")}
                    defaultChecked={values?.correct.includes(String(index)) ?? false}
                    className="h-5 w-5 shrink-0"
                  />
                )}
                <input
                  name="optionText"
                  dir="rtl"
                  className="input"
                  defaultValue={values?.optionTexts[index] ?? defaults[index] ?? ""}
                  placeholder={
                    isFillBlank
                      ? t("placeholders.answer", { n: String(index + 1) })
                      : t("placeholders.option", { n: String(index + 1) })
                  }
                />
              </div>
            ))}
          </div>
          {editing && <p className="mt-3 text-xs text-muted-foreground">{t("clearToRemove")}</p>}
        </fieldset>
      )}

      {kind === "short_text" && (
        <p className="text-sm text-muted-foreground">{t("shortTextHint")}</p>
      )}

      <div className="sm:w-40">
        <label className="field-label" htmlFor={`${uid}-points`}>
          {t("fields.points")}
        </label>
        <input
          id={`${uid}-points`}
          name="points"
          type="number"
          min={1}
          step={1}
          className="input"
          defaultValue={values?.points ?? "1"}
        />
      </div>

      {editing && <p className="text-sm text-muted-foreground">{t("regradeNote")}</p>}

      {error && (
        <p role="alert" className="text-sm text-absent">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton editing={editing} />
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary w-full sm:w-auto">
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function fromQuestion(question: EditableQuestion) {
  return {
    prompt: question.prompt,
    unitId: question.unitId ?? "",
    points: String(question.points),
    optionTexts: question.options.map((option) => option.text),
    correct: question.options.flatMap((option, index) =>
      option.is_correct ? [String(index)] : [],
    ),
  };
}
