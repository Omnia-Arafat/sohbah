import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ScheduleSheet } from "@/components/schedule-sheet";
import { PrintButton } from "@/app/[locale]/[academy]/admin/reports/print/print-button";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getSheet } from "@/lib/schedule-dal";
import { arNum, decodeSheet } from "@/lib/schedule-format";

/**
 * The printed weekly schedule, one A4 sheet per `s` parameter
 * (`?s=trackId.cohortId|base.week&s=…`). Every sheet is the same layout with
 * its own track, cohort and week on top.
 *
 * "Download PDF" is the browser's own Save as PDF from the print dialog: no
 * PDF library ships to the phone for a page the browser already prints.
 *
 * Open to anyone: what a sheet shows is decided by track_weeks' own policy
 * (published weeks are public, drafts only reach staff).
 */

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ s?: string | string[]; back?: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "جدول الأسبوع" };

export default async function PrintSchedulePage({ params, searchParams }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const { s, back } = await searchParams;
  const refs = (Array.isArray(s) ? s : s ? [s] : [])
    .slice(0, 30)
    .map(decodeSheet)
    .filter((r) => r !== null);
  if (refs.length === 0) notFound();

  const sheets = (await Promise.all(refs.map(getSheet))).filter((x) => x !== null);
  if (sheets.length === 0) notFound();

  // Only paths inside this academy, so the link cannot be pointed elsewhere.
  const backHref = back && back.startsWith(`/${academySlug}/`) ? back : `/${academySlug}`;

  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-6 print:max-w-none print:gap-0">
      <style>{`@media print { @page { size: A4; margin: 0; } .schedule-page { break-after: page; } .schedule-page:last-child { break-after: auto; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={backHref}>رجوع</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-muted-foreground">
            {sheets.length === 1 ? "ورقة واحدة" : sheets.length === 2 ? "ورقتين" : `${arNum(sheets.length)} ورقات`}
            {" · "}للتنزيل اختاري «حفظ كـ PDF» من نافذة الطباعة
          </span>
          <PrintButton label="اطبعي أو نزّلي PDF" />
        </div>
      </div>

      {sheets.map((sheet, i) => (
        <section
          key={i}
          className="schedule-page overflow-hidden rounded-2xl shadow-md print:rounded-none print:shadow-none"
          aria-label={`${sheet.trackName} · ${sheet.cohortName ?? "كل الدفعات"} · الأسبوع ${arNum(sheet.ref.week)}`}
        >
          <ScheduleSheet
            trackName={sheet.trackName}
            cohortName={sheet.cohortName}
            cohortStartDate={sheet.cohortStartDate}
            weekNumber={sheet.ref.week}
            week={sheet.week}
          />
        </section>
      ))}
    </div>
  );
}
