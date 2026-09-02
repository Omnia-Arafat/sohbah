import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getLocalizedAcademyName } from "@/lib/academy-display";
import { notFound } from "next/navigation";
import Image from "next/image";

type AcademyHomeProps = {
  params: Promise<{ locale: string; academy: string }>
};

export default async function AcademyHome({ params }: AcademyHomeProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations("home");
  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center text-center">
        {academy.logo_path ? (
          <div className="relative h-20 w-20">
            <Image
              src={academy.logo_path}
              alt={academyName}
              fill
              className="object-contain"
            />
          </div>
        ) : (
          <BrandMark className="h-20 w-20" />
        )}
        <h1 className="font-display mt-4 text-3xl font-bold sm:text-4xl">
          {academyName}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/*
        Two doors, deliberately side by side. The two audiences are entirely
        separate: students never authenticate, teachers always do.
      */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card flex flex-col border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <span className="badge-done self-start">{t("doors.students.tag")}</span>
          <h2 className="mt-3 text-xl font-semibold">{t("doors.students.title")}</h2>
          <p className="mt-2 flex-1 text-muted-foreground">
            {t("doors.students.body")}
          </p>
          <Link href={`/${academySlug}/register`} className="btn-primary mt-4 w-full">
            {t("doors.students.cta")}
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("doors.students.note")}
          </p>
        </div>

        <div className="card flex flex-col">
          <span className="badge-waiting self-start">{t("doors.teachers.tag")}</span>
          <h2 className="mt-3 text-xl font-semibold">{t("doors.teachers.title")}</h2>
          <p className="mt-2 flex-1 text-muted-foreground">
            {t("doors.teachers.body")}
          </p>
          <Link href={`/${academySlug}/login`} className="btn-primary mt-4 w-full">
            {t("doors.teachers.cta")}
          </Link>
          {/*
            Registering is the other half of this door, not a footnote: a new
            معلمة has no account yet, and this is the first place she looks.
          */}
          <Link
            href={`/${academySlug}/register-teacher`}
            className="btn-secondary mt-2 w-full"
          >
            {t("doors.teachers.register")}
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("doors.teachers.note")}
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold">{t("returningStudent.title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("returningStudent.body")}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("returningStudent.note")}
        </p>
      </section>
    </div>
  );
}
