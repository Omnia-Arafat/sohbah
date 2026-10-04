import { permanentRedirect } from "next/navigation";

type MePageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/**
 * صفحتي is the home screen now: once a student is signed in, her حفظ, her
 * circles and her recent recitations are on it, and the جزء map is /hifz.
 * This address stays alive for the links already sent to groups and saved to
 * home screens. /me/track and /me/track/card are unchanged.
 */
export default async function MePage({ params }: MePageProps) {
  const { locale, academy: academySlug } = await params;
  permanentRedirect(`/${locale}/${academySlug}`);
}
