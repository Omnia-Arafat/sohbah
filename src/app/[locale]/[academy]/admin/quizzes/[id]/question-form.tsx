"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { CurriculumUnit, QuestionKind } from "@/lib/database.types";
import { addQuestion, type QuestionFormState } from "./actions";

const OPTION_SLOTS = 4;

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.quizzes.questions");
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? t("adding") : t("add")}
    </button>
  );
}

/**
 * Writing one question.
 *
 * The kind picker changes what the rest of the form asks for, because the five
 * kinds genuinely need different things: a choice question needs options and a
 * correct one; a fill-in needs the accepted spellings; a written answer needs
 * nothing but the prompt, since a معلمة will mark it herself.
 */
export function QuestionForm({
  academySlug,
  quizId,
  units,
  locale,
}: {
  academySlug: string;
  quizId: string;
  units: CurriculumUnit[];
  locale: string;
}) {
  const t = useTranslations("admin.quizzes.questions");
  const [state, formAction] = useActionState<QuestionFormState, FormData>(addQuestion, {
    status: "idle",
  });

  const [kind, setKind] = useState<QuestionKind>("mcq");

  const needsOptions = kind === "mcq" || kind === "multi" || kind === "true_false";
  const isFillBlank = kind === "fill_blank";
  const multiple = kind === "multi";
  // True/false is a choice question with its two options written for her.
  const slots = kind === "true_false" ? 2 : OPTION_SLOTS;
  const defaults = kind === "true_false" ? [t("true"), t("false")] : [];

  return (
    <form
      action={formAction}
      // Remounting on kind change clears option boxes that no longer apply,
      // so a leftover answer from a previous kind cannot be submitted.
      key={kind}
      className="card flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="kind-select">
            {t("fields.kind")}
          </label>
          <select
            id="kind-select"
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value as QuestionKind)}
          >
            <option value="mcq">{t("kinds.mcq")}</option>
            <option value="true_false">{t("kinds.true_false")}</option>
            <option value="multi">{t("kinds.multi")}</option>
            <option value="fill_blank">{t("kinds.fill_blank")}</option>
            <option value="short_text">{t("kinds.short_text")}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="unitId">
            {t("fields.unit")}
          </label>
          <select id="unitId" name="unitId" className="input" defaultValue="">
            <option value="">{t("noUnit")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.position}. {locale === "ar" ? unit.title_ar : unit.title_en}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="prompt">
          {t("fields.prompt")}
        </label>
        <textarea
          id="prompt"
          name="prompt"
          rows={2}
          dir="rtl"
          className="input"
          placeholder={t("placeholders.prompt")}
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
            {Array.from({ length: isFillBlank ? OPTION_SLOTS : slots }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                {needsOptions && (
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    // A radio group needs one shared name; the value carries
                    // the row index so the server can line it up with the text.
                    name="optionCorrect"
                    value={String(index)}
                    aria-label={t("markCorrect")}
                    className="h-5 w-5 shrink-0"
                  />
                )}
                <input
                  name="optionText"
                  dir="rtl"
                  className="input"
                  defaultValue={defaults[index] ?? ""}
                  placeholder={
                    isFillBlank
                      ? t("placeholders.answer", { n: String(index + 1) })
                      : t("placeholders.option", { n: String(index + 1) })
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {kind === "short_text" && (
        <p className="text-sm text-muted-foreground">{t("shortTextHint")}</p>
      )}

      <div className="sm:w-40">
        <label className="field-label" htmlFor="points">
          {t("fields.points")}
        </label>
        <input
          id="points"
          name="points"
          type="number"
          min={1}
          step={1}
          className="input"
          defaultValue="1"
        />
      </div>

      {(state.status === "invalid" || state.status === "failed") && (
        <p className="text-sm text-absent">{t(`errors.${state.reason}`)}</p>
      )}

      <SubmitButton />
    </form>
  );
}
