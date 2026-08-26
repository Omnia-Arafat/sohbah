export const LOCALIZED_ACADEMY_SLUGS = ["sohbah"] as const;

export type LocalizedAcademySlug = (typeof LOCALIZED_ACADEMY_SLUGS)[number];

export const ACADEMY_BRANDING: Record<
  LocalizedAcademySlug,
  {
    name: { ar: string; en: string };
    adminRole: { ar: string; en: string };
  }
> = {
  sohbah: {
    name: {
      ar: "مقراءة صحبة الإلكترونية",
      en: "Sohbah Online Recitation",
    },
    adminRole: {
      ar: "مشرف صحبة",
      en: "Sohbah Admin",
    },
  },
};

export function isLocalizedAcademySlug(
  slug: string,
): slug is LocalizedAcademySlug {
  return (LOCALIZED_ACADEMY_SLUGS as readonly string[]).includes(slug);
}

function localeLang(locale: string): "ar" | "en" {
  return locale === "ar" ? "ar" : "en";
}

type AcademyNames = { name_ar: string; name_en: string };

export function getAcademyBrandName(slug: string, locale: string): string | null {
  if (!isLocalizedAcademySlug(slug)) return null;
  return ACADEMY_BRANDING[slug].name[localeLang(locale)];
}

export function getAcademyAdminRole(slug: string, locale: string): string | null {
  if (!isLocalizedAcademySlug(slug)) return null;
  return ACADEMY_BRANDING[slug].adminRole[localeLang(locale)];
}

/** Prefer coded branding so labels stay correct even if the DB is stale. */
export async function getLocalizedAcademyName(
  slug: string,
  locale: string,
  fallback: AcademyNames,
): Promise<string> {
  return getAcademyBrandName(slug, locale)
    ?? (locale === "ar" ? fallback.name_ar : fallback.name_en);
}

export function getAcademyNameFromMessages(
  slug: string,
  locale: string,
  fallback: AcademyNames,
  _t: (key: `${LocalizedAcademySlug}.name`) => string,
): string {
  return getAcademyBrandName(slug, locale)
    ?? (locale === "ar" ? fallback.name_ar : fallback.name_en);
}

type TeacherLike = { name: string; role: string };

/** Admin label follows the academy in the URL, not the name stored in the DB. */
export function getTeacherDisplayLabel(
  teacher: TeacherLike,
  academySlug: string | undefined,
  locale: string,
): string {
  if (teacher.role === "admin" && academySlug) {
    const adminRole = getAcademyAdminRole(academySlug, locale);
    if (adminRole) return adminRole;
  }
  return teacher.name;
}
