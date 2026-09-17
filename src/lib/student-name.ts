/**
 * How a student's name is shown.
 *
 * `students.father_name` is NOT NULL, and the simplified registration form
 * stopped asking for it — `register/actions.ts` writes "-" to satisfy the
 * column. Every student in both academies now carries that placeholder (122 of
 * 122, checked against production), so the screens that printed
 * `name + father_name` were showing a dash under every name in the معلمة's
 * queue and a whole column of dashes in the roster.
 *
 * The column itself stays: it is NOT NULL, `find_similar_students()` still
 * takes it, and a real name typed before the form was simplified must not be
 * thrown away. Only the display stops repeating the placeholder.
 */

/** The placeholder `register/actions.ts` writes when nobody asked for a name. */
const PLACEHOLDER = "-";

/** The father's name when there is a real one, otherwise `null`. */
export function realFatherName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed && trimmed !== PLACEHOLDER ? trimmed : null;
}

/** "سارة محمود" — with the father's name only when one was actually given. */
export function fullStudentName(
  name: string,
  fatherName?: string | null,
): string {
  const father = realFatherName(fatherName);
  return father ? `${name} ${father}` : name;
}
