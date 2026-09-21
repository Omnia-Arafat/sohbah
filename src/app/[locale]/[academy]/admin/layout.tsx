/**
 * The admin area used to open with a <DashboardHeader> card: the signed-in
 * name, her role, a "لوحة المشرف" link and a sign-out button.
 *
 * All four of those now live in the navigation that wraps every academy page
 * — the rail's footer on a desktop, the "المزيد" sheet on a phone — so the
 * card was printing the same name twice on top of the page, directly above
 * the heading that greets her by it. Nothing was lost by removing it, and
 * /admin gets its first screenful back.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
