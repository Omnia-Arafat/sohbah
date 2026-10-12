import { getTranslations } from "next-intl/server";
import { BrandSelect } from "@/components/brand-select";
import { DateField } from "@/components/date-field";
import { MonthYearPicker } from "@/components/month-year-picker";
import { Link } from "@/i18n/navigation";
import { REPORT_MODES, type ReportRange } from "@/lib/report-range";

/**
 * The period picker both reports share. It must sit inside a
 * `<form className="range-form">`: which of the fields below shows is driven
 * purely by the selected mode — see `.range-form` in globals.css.
 */
export async function ReportRangeFields({
  range,
  locale,
}: {
  range: ReportRange;
  locale: string;
}) {
  const t = await getTranslations("reports");

  return (
    <>
      <div>
        <label className="field-label" htmlFor="mode">
          {t("filters.mode")}
        </label>
        <BrandSelect
          id="mode"
          name="mode"
          className="report-mode"
          defaultValue={range.mode}
          options={REPORT_MODES.map((mode) => ({
            value: mode,
            label: t(`filters.modes.${mode}`),
          }))}
        />
      </div>

      {/* Exactly one of these four shows at a time. A single-field mode
          (month, year) spans the full row instead of leaving the other grid
          cell empty beside it. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* A separate field name from the month-mode picker below, even
            though both mean "month" — two inputs sharing one `name` would
            both submit, since CSS `display: none` hides an input without
            removing it from the form. */}
        <div className="mode-week-only">
          <label className="field-label" htmlFor="weekMonth">
            {t("filters.month")}
          </label>
          <MonthYearPicker
            id="weekMonth"
            name="weekMonth"
            defaultValue={range.month}
            locale={locale}
          />
        </div>

        <div className="mode-week-only">
          <label className="field-label" htmlFor="week">
            {t("filters.week")}
          </label>
          <BrandSelect
            id="week"
            name="week"
            defaultValue={String(range.week)}
            options={[1, 2, 3, 4].map((week) => ({
              value: String(week),
              label: t(`filters.weekOptions.${week}`),
            }))}
          />
        </div>

        <div className="mode-month-only sm:col-span-2">
          <label className="field-label" htmlFor="month">
            {t("filters.month")}
          </label>
          <MonthYearPicker
            id="month"
            name="month"
            defaultValue={range.month}
            locale={locale}
          />
        </div>

        <div className="mode-year-only sm:col-span-2">
          <label className="field-label" htmlFor="year">
            {t("filters.year")}
          </label>
          <input
            id="year"
            name="year"
            type="number"
            inputMode="numeric"
            min="2020"
            max="2100"
            dir="ltr"
            className="input text-start"
            defaultValue={range.year}
          />
        </div>

        <div className="mode-custom-only">
          <label className="field-label" htmlFor="from">
            {t("filters.from")}
          </label>
          <DateField id="from" name="from" defaultValue={range.from} />
        </div>

        <div className="mode-custom-only">
          <label className="field-label" htmlFor="to">
            {t("filters.to")}
          </label>
          <DateField id="to" name="to" defaultValue={range.to} />
        </div>
      </div>
    </>
  );
}

/** The two reports, side by side as tabs. */
export async function ReportTabs({
  academySlug,
  active,
}: {
  academySlug: string;
  active: "attendance" | "tracks";
}) {
  const t = await getTranslations("reports.tabs");
  const tabs = [
    { key: "attendance", href: `/${academySlug}/admin/reports` },
    { key: "tracks", href: `/${academySlug}/admin/reports/tracks` },
  ] as const;

  return (
    <nav className="flex gap-2" aria-label={t("label")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            tab.key === active
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-border text-muted-foreground hover:bg-surface-muted"
          }`}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
