import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { BackLink } from "@/components/back-link";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { CircleForm } from "./circle-form";

type NewCirclePageProps = { params: Promise<{ locale: string; academy: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: NewCirclePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.new" });
  return { title: t("title") };
}

export default async function NewCirclePage({ params }: NewCirclePageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("dashboard.new");
  const session = await requireTeacherSession(`/${academySlug}/dashboard/new`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/dashboard`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      <CircleForm
        defaultTimezone={DEFAULT_TIMEZONE}
        registrationSlug={`halaqa-${randomUUID()}`}
        locale={locale}
        academySlug={academySlug}
      />
    </div>
  );
}
