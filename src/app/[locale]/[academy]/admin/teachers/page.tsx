import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import type { Teacher } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { deleteTeacher, setTeacherActive } from "./actions";
import { ResetPasswordButton } from "./reset-button";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ role?: string }>;
};

/** Tab order: معلمات first, since that is the bulk of the list. */
const ROLE_TABS = ["teacher", "admin"] as const;

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.teachers" });
  return { title: t("title") };
}

export default async function AdminTeachersPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Comes from the URL, so validate rather than trusting it.
  const { role: requestedRole } = await searchParams;
  const activeRole: (typeof ROLE_TABS)[number] =
    requestedRole === "admin" ? "admin" : "teacher";

  const session = await requireStaffSession(`/${academySlug}/admin/teachers`);
  // Approving, editing and removing stay مشرفة-only; every action re-checks.
  const canManage = session.teacher.role === "admin";

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.teachers");
  const tDashboard = await getTranslations("dashboard");

  const supabase = await createClient();

  const [teachersResult, circlesResult] = await Promise.all([
    supabase
      .from("teachers")
      .select("*")
      .eq("academy_id", academy.id)
      .order("name"),
    supabase.from("circles").select("teacher_id"),
  ]);

  if (teachersResult.error) {
    console.error("teachers load failed", teachersResult.error);
  }

  const teachers: Teacher[] = teachersResult.data ?? [];

  // Deleting a teacher cascades to their circles and all attendance history,
  // so the page needs to know who owns circles before offering the button.
  const circleOwners = new Set(
    (circlesResult.data ?? []).map((circle) => circle.teacher_id),
  );

  // Counts come from the whole list so each tab can show its own pending
  // badge — otherwise a request in the other tab is invisible until you look.
  const pendingByRole = {
    teacher: teachers.filter((t) => t.role === "teacher" && !t.is_active).length,
    admin: teachers.filter((t) => t.role === "admin" && !t.is_active).length,
  };

  const inTab = teachers.filter((teacher) => teacher.role === activeRole);
  const pending = inTab.filter((teacher) => !teacher.is_active);
  const active = inTab.filter((teacher) => teacher.is_active);

  function HiddenContext({ teacherId }: { teacherId: string }) {
    return (
      <>
        <input type="hidden" name="teacherId" value={teacherId} />
        <input type="hidden" name="academySlug" value={academySlug} />
        <input type="hidden" name="locale" value={locale} />
      </>
    );
  }

  function TeacherCard({ teacher }: { teacher: Teacher }) {
    const ownsCircles = circleOwners.has(teacher.id);

    return (
      <li className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* No role badge: the tab above already says which role this is. */}
            <p className="truncate font-semibold">{teacher.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tDashboard(`gender.${teacher.gender_category}`)}
              {teacher.phone && (
                <>
                  {" · "}
                  <span dir="ltr">{teacher.phone}</span>
                </>
              )}
            </p>
            {/* Whether an Auth user is linked is super-admin business, not
                something this screen mentions. */}
            {ownsCircles && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ownsCircles")}
              </p>
            )}
          </div>
        </div>

        {/* Everyone approved can see this list; only a مشرفة can act on it. */}
        {canManage && (
        <div className="flex flex-wrap gap-2">
          <form action={setTeacherActive}>
            <HiddenContext teacherId={teacher.id} />
            <input
              type="hidden"
              name="isActive"
              value={teacher.is_active ? "0" : "1"}
            />
            <button
              type="submit"
              className={
                teacher.is_active
                  ? "btn-secondary px-4 py-2 text-sm"
                  : "btn-primary px-4 py-2 text-sm"
              }
            >
              {teacher.is_active ? t("suspend") : t("approve")}
            </button>
          </form>

          {/* Only an approved teacher has a sign-in to reset. */}
          {teacher.is_active && (
            <ResetPasswordButton
              teacherId={teacher.id}
              teacherName={teacher.name}
              academySlug={academySlug}
              locale={locale}
            />
          )}

          <Link
            href={`/${academySlug}/admin/teachers/${teacher.id}/edit`}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {t("edit")}
          </Link>

          {/*
            A teacher who owns circles cannot be deleted without taking those
            circles and their attendance history with them, so the button is
            withheld rather than shown and then refused.
          */}
          {!ownsCircles && (
            <form action={deleteTeacher}>
              <HiddenContext teacherId={teacher.id} />
              <ConfirmButton
                label={teacher.is_active ? t("delete") : t("reject")}
                confirmMessage={
                  teacher.is_active
                    ? t("confirmDelete", { name: teacher.name })
                    : t("confirmReject", { name: teacher.name })
                }
                className="rounded-xl border border-absent px-4 py-2 text-sm
                           font-semibold text-absent transition-colors
                           hover:bg-absent hover:text-white"
              />
            </form>
          )}
        </div>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/*
        The registration form is public and unlisted — nothing links to it
        except the sign-in page — so people reach it by being sent this.
      */}
      <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <h2 className="font-semibold">{t("shareLink.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shareLink.body")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Shown as text as well as copied: clipboard access can be refused,
              and then the link is still readable. */}
          <code
            dir="ltr"
            className="min-w-0 flex-1 truncate rounded-lg bg-surface-muted px-3 py-2 text-sm"
          >
            {`/${locale}/${academySlug}/register-teacher`}
          </code>
          <CopyLinkButton path={`/${locale}/${academySlug}/register-teacher`} />
        </div>
      </section>

      {/*
        Plain links rather than client-side tabs: the selected role lives in the
        URL, so it survives an approve/reject (which re-renders the page) and
        can be bookmarked. No JavaScript needed.
      */}
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="flex gap-1 rounded-xl border border-border-subtle bg-surface-muted p-1"
      >
        {ROLE_TABS.map((tab) => {
          const selected = tab === activeRole;
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={selected}
              href={`/${academySlug}/admin/teachers?role=${tab}`}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg
                          px-4 py-2 text-sm font-semibold transition-colors ${
                            selected
                              ? "bg-surface text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-surface/60 hover:text-foreground"
                          }`}
            >
              {t(`tabs.${tab}`)}
              {pendingByRole[tab] > 0 && (
                <span className="rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingByRole[tab]}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("pending", { count: String(pending.length) })}
        </h2>
        {pending.length === 0 ? (
          <p className="card text-muted-foreground">{t("noPending")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("activeList", { count: String(active.length) })}
        </h2>
        {active.length === 0 ? (
          <p className="card text-muted-foreground">{t("noActive")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
