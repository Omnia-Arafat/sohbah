import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserMinus } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
  const tTrack = await getTranslations("track");
  const tTracks = await getTranslations("tracks");
  const tAdmin = await getTranslations("admin");
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
      <nav className="text-xs text-muted-foreground">
        <Link
          href={`/${academySlug}/admin/tracks/${id}`}
          className="hover:underline"
        >
          {cohort.trackName}
        </Link>
      </nav>

      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {cohort.name}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {[
            cohort.teacherName ?? tTrack("noTeacher"),
            t("startedOn", { date: startLabel }),
          ].join(" · ")}
        </p>
      </section>

      {/* Seats, plainly. The number the admin needs before adding anyone. */}
      <section className="flex overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">
            {cohort.enrolled.length}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("onTrack")}</p>
        </div>
        <div aria-hidden="true" className="w-px bg-border-subtle" />
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">
            {seatsLeft === null ? "—" : seatsLeft}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("free")}</p>
        </div>
        <div aria-hidden="true" className="w-px bg-border-subtle" />
        <div className="flex-grow px-2 py-4 text-center">
          <p className="text-2xl font-bold leading-tight">
            {cohort.waiting.length}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("waiting")}</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Adding the existing roster. This is the screen the academy uses
          once per cohort, to stop working on paper.
      --------------------------------------------------------------- */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center gap-2.5 bg-surface-muted px-4 py-2.5">
          <h2 className="flex-grow text-sm font-bold text-foreground/80">
            {t("addTitle")}
          </h2>
        </div>
        <p className="border-b border-border-subtle px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t("addNote")}
        </p>
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
                  <span className="text-muted-foreground">
                    {" "}
                    {enrolment.fatherName}
                  </span>
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
                  <span className="text-muted-foreground">
                    {" "}
                    {enrolment.fatherName}
                  </span>
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
