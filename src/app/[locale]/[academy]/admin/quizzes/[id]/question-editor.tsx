"use client";

import { useCallback, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CurriculumUnit } from "@/lib/database.types";
import { QuestionForm, type EditableQuestion } from "./question-form";

/**
 * The تعديل button under a question, and the form it opens. Closed again on
 * save, with a line saying how many finished attempts were marked again.
 */
export function QuestionEditor(props: {
  academySlug: string;
  quizId: string;
  units: CurriculumUnit[];
  locale: string;
  question: EditableQuestion;
}) {
  const t = useTranslations("admin.quizzes.questions");
  const [open, setOpen] = useState(false);
  const [regraded, setRegraded] = useState<number | null>(null);

  const handleSaved = useCallback((count: number) => {
    setOpen(false);
    setRegraded(count);
  }, []);

  if (open) {
    return (
      <QuestionForm {...props} onSaved={handleSaved} onCancel={() => setOpen(false)} />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          setRegraded(null);
          setOpen(true);
        }}
        className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
        {t("edit")}
      </button>
      {regraded !== null && (
        <p role="status" className="text-sm text-brand-700 dark:text-brand-300">
          {regraded > 0 ? t("savedRegraded", { count: String(regraded) }) : t("saved")}
        </p>
      )}
    </div>
  );
}
