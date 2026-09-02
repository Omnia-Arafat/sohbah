import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";

type StudentsAdminPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ search?: string; gender?: string; page?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: StudentsAdminPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.students" });
  const tAdmin = await getTranslations({ locale, namespace: "admin" });
  return { title: `${t("title")} · ${tAdmin("title")}` };
}

export default async function StudentsAdminPage({ params, searchParams }: StudentsAdminPageProps) {
  const { locale, academy: academySlug } = await params;
  const { search, gender, page } = await searchParams;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations();
  const tStudents = await getTranslations("admin.students");
  const tAdmin = await getTranslations("admin");

  const session = await requireTeacherSession(`/${academySlug}/admin/students`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // Only admins can access this page
  // One tier for now: anyone approved may look. The controls that change
  // something are hidden below and re-checked in every server action.
  const canManage = session.teacher.role === "admin";

  const supabase = await createClient();
  const pageSize = 50;
  const currentPage = parseInt(page || "1");
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build query
  let query = supabase
    .from("students")
    .select("*", { count: "exact" })
    .eq("academy_id", academy.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  // Apply filters
  if (gender && (gender === "male" || gender === "female")) {
    query = query.eq("gender_category", gender);
  }

  if (search && search.length >= 2) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: students, error, count } = await query;

  if (error) console.error("Failed to fetch students:", error);

  const totalPages = Math.ceil((count || 0) / pageSize);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {tStudents("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {tStudents("subtitle")}
        </p>
      </section>

      <BackLink href={`/${academySlug}/admin`}>{tAdmin("backToAdmin")}</BackLink>

      {/* Filters */}
      <div className="card">
        <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="search" className="field-label">
              {tStudents("searchLabel")}
            </label>
            <input
              id="search"
              name="search"
              type="text"
              className="input"
              placeholder={tStudents("searchPlaceholder")}
              defaultValue={search || ""}
            />
          </div>

          <div className="sm:w-48">
            <label htmlFor="gender" className="field-label">
              {tStudents("genderLabel")}
            </label>
            <select
              id="gender"
              name="gender"
              className="input"
              defaultValue={gender || ""}
            >
              <option value="">{tStudents("all")}</option>
              <option value="male">{tStudents("male")}</option>
              <option value="female">{tStudents("female")}</option>
            </select>
          </div>

          <button type="submit" className="btn-primary">
            {tStudents("filter")}
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {tStudents("found", { count: count || 0 })}
          </p>
          {totalPages > 1 && (
            <p className="text-sm text-muted-foreground">
              {tStudents("page", { current: currentPage, total: totalPages })}
            </p>
          )}
        </div>

        {!students || students.length === 0 ? (
          <p className="text-center text-muted-foreground">
            {tStudents("noStudents")}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">{tStudents("name")}</th>
                    <th className="pb-3 font-medium">{tStudents("fatherName")}</th>
                    <th className="pb-3 font-medium">{tStudents("gender")}</th>
                    <th className="pb-3 font-medium">{tStudents("phone")}</th>
                    <th className="pb-3 font-medium">{tStudents("registered")}</th>
                    <th className="pb-3 font-medium text-right">{tStudents("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-3 font-medium">{student.name}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {student.father_name}
                      </td>
                      <td className="py-3">
                        <span className={`badge-${student.gender_category === 'male' ? 'waiting' : 'done'} text-xs`}>
                          {t(`dashboard.gender.${student.gender_category}`)}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {student.phone || "—"}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(student.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          {canManage && (<>
                          <Link
                            href={`/${academySlug}/admin/students/${student.id}/edit`}
                            className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            title={tStudents("edit")}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            {tStudents("edit")}
                          </Link>
                          <Link
                            href={`/${academySlug}/admin/students/${student.id}/delete`}
                            className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm text-absent hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-950"
                            title={tStudents("delete")}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {tStudents("delete")}
                          </Link>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 sm:hidden">
              {students.map((student) => (
                <div key={student.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{student.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{student.father_name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className={`badge-${student.gender_category === 'male' ? 'waiting' : 'done'} text-xs`}>
                          {t(`dashboard.gender.${student.gender_category}`)}
                        </span>
                        {student.phone && <span>{student.phone}</span>}
                        <span>{new Date(student.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canManage && (<>
                      <Link
                        href={`/${academySlug}/admin/students/${student.id}/edit`}
                        className="rounded-lg border border-border-subtle bg-surface p-2 hover:bg-accent-50 transition-colors"
                        title={tStudents("edit")}
                      >
                        <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Link>
                      <Link
                        href={`/${academySlug}/admin/students/${student.id}/delete`}
                        className="rounded-lg border border-border-subtle bg-surface p-2 hover:bg-red-50 hover:border-red-300 transition-colors"
                        title={tStudents("delete")}
                      >
                        <svg className="h-4 w-4 text-absent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Link>
                      </>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {currentPage > 1 && (
              <Link
                href={`/${academySlug}/admin/students?page=${currentPage - 1}${search ? `&search=${search}` : ''}${gender ? `&gender=${gender}` : ''}`}
                className="btn-secondary px-4 py-2 text-sm"
              >
                {tStudents("previous")}
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/${academySlug}/admin/students?page=${currentPage + 1}${search ? `&search=${search}` : ''}${gender ? `&gender=${gender}` : ''}`}
                className="btn-secondary px-4 py-2 text-sm"
              >
                {tStudents("next")}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
