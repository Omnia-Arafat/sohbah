import { redirect } from "next/navigation";

/** The mushaf opens at الفاتحة. A deeper link carries its own page number. */
export default async function MushafIndex({
  params,
}: {
  params: Promise<{ locale: string; academy: string }>;
}) {
  const { locale, academy } = await params;
  redirect(`/${locale}/${academy}/mushaf/1`);
}
