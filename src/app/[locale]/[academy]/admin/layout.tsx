import { DashboardHeader } from "@/components/dashboard-header";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";

type AdminLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ academy: string }>;
};

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { academy: academySlug } = await params;
  const session = await getTeacherSession();

  return (
    <div className="flex flex-col gap-6">
      {isActiveTeacher(session) && (
        <DashboardHeader teacher={session.teacher} academySlug={academySlug} />
      )}
      {children}
    </div>
  );
}
