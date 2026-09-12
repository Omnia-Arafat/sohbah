import { getTranslations } from "next-intl/server";
import type { CircleLessonRow } from "@/lib/database.types";

/**
 * Today's lesson, as both the معلمة and the student see it.
 *
 * Every field below the title is optional, and the card renders whatever was
 * filled in: a حديث shows its text, narrator, source and grade; a باب من متن
 * التجويد shows its text and nothing else, with no empty labelled rows left
 * behind. That is the whole reason `curriculum_units` keeps those columns
 * nullable instead of splitting into a table per circle type.
 */
export async function LessonCard({
  lesson,
  locale,
}: {
  lesson: CircleLessonRow;
  locale: string;
}) {
  const t = await getTranslations("lesson");

  const title = locale === "ar" ? lesson.title_ar : lesson.title_en;
  const curriculum =
    locale === "ar" ? lesson.curriculum_ar : lesson.curriculum_en;

  // A note with no unit is legitimate: "مراجعة عامة النهاردة" is a lesson too.
  if (!title && !lesson.note) return null;

  const meta = [lesson.narrator, lesson.source_book, lesson.source_ref, lesson.grade]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="card border-accent-200 bg-accent-50 dark:border-accent-800 dark:bg-surface">
      <p className="text-sm font-medium text-accent-700 dark:text-accent-300">
        {t("today")}
        {curriculum ? ` · ${curriculum}` : ""}
      </p>

      {title && (
        <h2 className="font-display mt-1 text-xl font-bold">
          {lesson.unit_position ? `${lesson.unit_position}. ` : ""}
          {title}
        </h2>
      )}

      {lesson.body && (
        <p className="mt-3 whitespace-pre-line leading-relaxed">{lesson.body}</p>
      )}

      {meta && <p className="mt-2 text-sm text-muted-foreground">{meta}</p>}

      {lesson.explanation && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="text-sm font-medium">{t("explanation")}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {lesson.explanation}
          </p>
        </div>
      )}

      {lesson.note && (
        <p className="mt-3 text-sm text-accent-700 dark:text-accent-300">
          {lesson.note}
        </p>
      )}
    </section>
  );
}
