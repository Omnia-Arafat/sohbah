import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

type HomeProps = { params: Promise<{ locale: string }> };

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Sohbah is the only academy — redirect directly.
  redirect("/sohbah");
}
