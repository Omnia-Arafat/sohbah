import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserMinus, UserPlus, Pencil, CalendarCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BackLink, ChevronForward } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getCohort, listAddableStudents } from "@/lib/cohort-dal";
import { AddStudents } from "./add-students";
import { removeStudent } from "./actions";

type PageProps = {
  params: Promise<{
    locale: string;
    academy: string;
    id: string;
    cohortId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cohort" });
  return { title: t("title") };
}

export default async function CohortPage({ params }: PageProps) {
  const { locale, academy: academySlug, id, cohortId } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("cohort");

  const tTracks = await getTranslations("tracks");
  const tAdmin = await getTranslations("admin");
  const tEdit = await getTranslations("cohortEdit");
  const tDay = await getTranslations("cohortDay");
  const session = await getTeacherSession();

  if (!session || !isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session?.teacher ? "inactive" : "notLinked"}
        email={session?.email ?? null}
      />
    );
  }

  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tTracks("adminOnly")}</p>
      </div>
    );
  }

  const [cohort, candidates] = await Promise.all([
    getCohort(academy.id, cohortId),
    listAddableStudents(academy.id),
  ]);

  if (cohort === "missing-schema" || !cohort) notFound();

  const seatsLeft =
    cohort.maxStudents === null
      ? null
      : Math.max(cohort.maxStudents - cohort.enrolled.length, 0);

  const startLabel = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date(`${cohort.startDate}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/${academySlug}/admin/tracks/${id}`}>{t("back")}</BackLink>

      <section className="flex items-start gap-3">
        <div className="min-w-0 flex-grow">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {cohort.name}
          </h1>
          {/* The start date is the one field a mistake hides behind: it decides
              the week number and which weekday is "اليوم الأول". Printing it
              here is how a wrong one gets noticed; the pencil is how it gets
              fixed. The معلمة is no longer in this line — see below. */}
          <p className="mt-1.5 text-sm text-muted-foreground">
            {cohort.teacherName
              ? [cohort.teacherName, t("startedOn", { date: startLabel })].join(
                  " · ",
                )
              : t("startedOn", { date: startLabel })}
          </p>
        </div>

        <Link
          href={`/${academySlug}/admin/tracks/${id}/cohorts/${cohort.id}/edit`}
          title={tEdit("edit")}
          aria-label={tEdit("edit")}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-sm text-muted-foreground transition-colors hover:border-brand-500 hover:text-brand-700"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      {/* The day's reports. Above the roster because "who is behind today" is
          asked far more often than "who is on this cohort". */}
      <Link
        href={`/${academySlug}/admin/tracks/${id}/cohorts/${cohort.id}/day`}
        className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface px-4 transition-colors hover:border-brand-600"
      >
        <CalendarCheck
          className="h-[18px] w-[18px] shrink-0 text-brand-600 dark:text-brand-300"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-grow">
          <span className="block text-sm font-bold">{tDay("title")}</span>
          <span className="block text-xs text-muted-foreground">
            {tDay("subtitle")}
          </span>
        </span>
        <ChevronForward className="h-4 w-4" />
      </Link>

      {/*
        The most consequential gap on the screen, and it used to be a grey
        caption under the title — the quietest voice on the page for the one
        thing that stops the cohort running. Gold, and a button rather than a
        statement. It disappears the moment she has one.
      */}
      {!cohort.teacherName && (
        <Link
          href={`/${academySlug}/admin/tracks/${id}/cohorts/${cohort.id}/edit`}
          className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-accent-300 bg-accent-100 px-4 dark:border-accent-700 dark:bg-accent-700/20"
        >
          <UserPlus
            className="h-[18px] w-[18px] shrink-0 text-accent-700 dark:text-accent-200"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-grow">
            <span className="block text-sm font-bold text-accent-700 dark:text-accent-200">
              {t("assignTeacher")}
            </span>
            <span className="block text-xs text-accent-700/85 dark:text-accent-200/85">
              {t("assignTeacherNote")}
            </span>
          </span>
          <ChevronForward className="h-4 w-4" />
        </Link>
      )}

      {/*
        One line, not three boxes. "١ ملتحقة / ٧ شاغر / ٠ في الانتظار" is the
        same fact three times — the second is the first subtracted from the
        capacity — and the third was zero and stays zero until someone
        applies, so it earns its place only when it is not.

        The pips carry the ratio without arithmetic; the words carry it for a
        screen reader and for a cohort whose capacity is not eight.
      */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
        {cohort.maxStudents !== null && (
          <span
            className="flex shrink-0 gap-1"
            role="img"
            aria-label={t("seatsTaken", {
              taken: cohort.enrolled.length,
              capacity: cohort.maxStudents,
            })}
          >
            {Array.from({ length: cohort.maxStudents }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full ${
                  i < cohort.enrolled.length ? "bg-brand-500" : "bg-surface-muted"
                }`}
              />
            ))}
          </span>
        )}
        <p className="min-w-0 flex-grow text-xs text-muted-foreground">
          <span className="font-bold text-foreground">
            {cohort.maxStudents === null
              ? cohort.enrolled.length
              : t("seatsTaken", {
                  taken: cohort.enrolled.length,
                  capacity: cohort.maxStudents,
                })}
          </span>
          {seatsLeft !== null && ` · ${t("seatsFree", { count: seatsLeft })}`}
        </p>
        {cohort.waiting.length > 0 && (
          <span className="shrink-0 rounded-full bg-accent-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {t("waitingCount", { count: cohort.waiting.length })}
          </span>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Adding the existing roster. This is the screen the academy uses
          once per cohort, to stop working on paper.
      --------------------------------------------------------------- */}
      {/*
        The panel that acts, and nothing but.

        It had a dark banner, a three-line explanation and a hint box wrapped
        around one empty search field — several times more chrome than
        control, for a panel whose entire job is "type a name". A heading and
        the field say the same thing and leave the roster room to be seen.
      */}
      <section
        id="add"
        className="overflow-hidden rounded-2xl border border-border-subtle bg-surface"
      >
        <div className="flex items-center gap-2 px-4 pb-1 pt-3.5">
          <UserPlus
            className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
            aria-hidden="true"
          />
          <h2 className="flex-grow text-sm font-bold">{t("addTitle")}</h2>
        </div>
        <AddStudents
          academySlug={academySlug}
          trackId={id}
          cohortId={cohort.id}
          candidates={candidates}
          seatsLeft={seatsLeft}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
          <h2 className="flex-grow text-sm font-bold text-foreground/80">
            {t("roster")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {cohort.enrolled.length}
          </span>
        </div>

        {cohort.enrolled.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            {t("rosterEmpty")}
          </p>
        ) : (
          <ul>
            {cohort.enrolled.map((enrolment) => (
              <li
                key={enrolment.id}
                className="flex items-center gap-3 border-t border-border-subtle px-4 py-2.5 first:border-t-0"
              >
                <span className="min-w-0 flex-grow truncate text-sm">
                  {enrolment.studentName}
                  {enrolment.fatherName && (
                    <span className="text-muted-foreground">
                      {" "}
                      {enrolment.fatherName}
                    </span>
                  )}
                </span>

                {/* A plain form, so removal works without JavaScript and
                    cannot happen on a stray GET. */}
                <form action={removeStudent}>
                  <input type="hidden" name="academySlug" value={academySlug} />
                  <input type="hidden" name="trackId" value={id} />
                  <input type="hidden" name="cohortId" value={cohort.id} />
                  <input type="hidden" name="enrolmentId" value={enrolment.id} />
                  <button
                    type="submit"
                    title={t("remove")}
                    aria-label={t("removeNamed", { name: enrolment.studentName })}
                    className="flex min-h-11 items-center rounded-lg border border-border-subtle px-3 text-muted-foreground transition-colors hover:border-absent hover:text-absent"
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cohort.waiting.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
            <h2 className="flex-grow text-sm font-bold text-foreground/80">
              {t("waitingTitle")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {cohort.waiting.length}
            </span>
          </div>
          <ul>
            {cohort.waiting.map((enrolment) => (
              <li
                key={enrolment.id}
                className="border-t border-border-subtle px-4 py-2.5 first:border-t-0"
              >
                <p className="truncate text-sm">
                  {enrolment.studentName}
                  {enrolment.fatherName && (
                    <span className="text-muted-foreground">
                      {" "}
                      {enrolment.fatherName}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-border-subtle px-4 py-2.5 text-xs text-muted-foreground">
            {t("waitingNote")}
          </p>
        </section>
      )}
    </div>
  );
}
