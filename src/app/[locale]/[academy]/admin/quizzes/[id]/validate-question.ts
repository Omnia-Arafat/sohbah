import type { QuestionKind } from "@/lib/database.types";

export type QuestionError =
  | "promptRequired"
  | "needTwoOptions"
  | "needCorrect"
  | "onlyOneCorrect"
  | "needAnswer";

/**
 * The rules a question must meet, shared by the form and the server action.
 *
 * The form runs them before submitting, so a half-written question is stopped
 * in the browser with everything she typed still on screen; the action runs
 * them again because the browser is not to be trusted with the answer key.
 */
export function validateQuestion(formData: FormData): QuestionError | null {
  const kind = String(formData.get("kind") ?? "") as QuestionKind;
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return "promptRequired";

  const texts = formData.getAll("optionText").map((value) => String(value).trim());
  // Checkbox values carry the row index, since unchecked boxes are not posted
  // at all and positional alignment would otherwise be lost.
  const correct = new Set(formData.getAll("optionCorrect").map((v) => String(v)));
  const filled = texts
    .map((text, index) => ({ text, index }))
    .filter((option) => option.text.length > 0);

  if (kind === "mcq" || kind === "multi" || kind === "true_false") {
    if (filled.length < 2) return "needTwoOptions";
    const correctCount = filled.filter((o) => correct.has(String(o.index))).length;
    if (correctCount === 0) return "needCorrect";
    // A single-answer question with several correct options would be graded by
    // set equality and become unanswerable in the UI, which offers one radio.
    if (kind !== "multi" && correctCount > 1) return "onlyOneCorrect";
  }

  if (kind === "fill_blank" && filled.length === 0) return "needAnswer";

  return null;
}
