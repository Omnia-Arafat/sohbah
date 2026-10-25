import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { Link } from "@/i18n/navigation";
import type { HomeworkProgressRow } from "@/lib/database.types";
import { fullStudentName } from "@/lib/student-name";

export type ProgressGroup = "solved" | "started" | "notYet";

function groupOf(row: HomeworkProgressRow): ProgressGroup {
  const checked = Number(row.checked_count);
  if (checked === 0) return "notYet";
  return checked >= Number(row.question_count) ? "solved" : "started";
}

/**
 * Who did a واجب: «حلّت», «بدأت», «ماحلّتش» — names only, never a mark. The
 * three groups are tabs with their counts, so the one she is looking for is a
 * tap away rather than at the bottom of the whole roster.
 */
export async function HomeworkProgress({
  academySlug,
  quizId,
  title,
  rows,
  show,
  locale,
}: {
  academySlug: string;
  quizId: string;
  title: string;
  rows: HomeworkProgressRow[];
  show: ProgressGroup;
  locale: string;
}) {
  const t = await getTranslations("admin.quizzes.homeworkProgress");

  const groups: Record<ProgressGroup, HomeworkProgressRow[]> = {
    solved: [],
    started: [],
    notYet: [],
  };
  for (const row of rows) groups[groupOf(row)].push(row);

  const listed = groups[show];
  const base = `/${academySlug}/admin/quizzes/${quizId}/results`;
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/quizzes/${quizId}`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      <nav className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-muted p-1.5">
        {(["solved", "started", "notYet"] as const).map((group) => (
          <Link
            key={group}
            href={`${base}?show=${group}`}
            aria-current={group === show ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-sm transition-colors ${
              group === show
                ? "bg-surface font-bold text-foreground shadow-sm"
                : "font-semibold text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-lg leading-tight">{groups[group].length}</span>
            <span className="text-xs">{t(`groups.${group}`)}</span>
          </Link>
        ))}
      </nav>

      {listed.length === 0 ? (
        <p className="card text-muted-foreground">{t(`empty.${show}`)}</p>
      ) : (
        <ul className="card flex flex-col p-0">
          {listed.map((row) => (
            <li
              key={row.student_id}
              className="flex items-center gap-3 border-t border-border-subtle px-5 py-3 first:border-t-0"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {fullStudentName(row.name, row.father_name)}
              </span>
              {show === "started" && (
                <span className="shrink-0 text-xs font-semibold text-accent-700 dark:text-accent-300">
                  {t("partial", { done: Number(row.checked_count), total: Number(row.question_count) })}
                </span>
              )}
              {row.last_checked_at && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateFormat.format(new Date(row.last_checked_at))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {show === "notYet" && (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("rosterNote")}</p>
      )}
    </div>
  );
}
