import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ academy: string; id: string }> };

// Old route — redirect to the new circles/[id]/edit route
export default async function OldAdminCircleEditPage({ params }: Props) {
  const { academy, id } = await params;
  const locale = await getLocale();
  redirect(`/${locale}/${academy}/admin/circles/${id}/edit`);
}
