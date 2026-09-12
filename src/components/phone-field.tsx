"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry } from "@/lib/phone";

/**
 * A country picker glued to the number input.
 *
 * The picker is deliberately narrow — a flag and a dial code, nothing more — so
 * the number itself keeps the width. It is a real `<select>`: on a phone that
 * opens the native wheel, which beats any custom dropdown for a معلمة entering
 * a queue of students on her way to a circle.
 *
 * Two names are submitted: `phoneCountry` (ISO) and `phone` (national digits).
 * The server joins them into E.164 — never the browser, so a page with JS off
 * still posts something the action can validate.
 */
export function PhoneField({
  label,
  hint,
  error,
  defaultCountry,
  defaultValue,
  name = "phone",
  countryName = "phoneCountry",
  id = "phone",
  required = true,
}: {
  label: string;
  hint?: string;
  error?: string;
  defaultCountry?: string | null;
  defaultValue?: string | null;
  name?: string;
  countryName?: string;
  id?: string;
  required?: boolean;
}) {
  const t = useTranslations("phone");
  const locale = useLocale();
  const [iso, setIso] = useState(
    () => findCountry(defaultCountry)?.iso ?? DEFAULT_COUNTRY,
  );
  const country = findCountry(iso);
  const countryLabel = (c: (typeof COUNTRIES)[number]) =>
    locale === "ar" ? c.nameAr : c.nameEn;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>

      {/* dir="ltr" on the row, so the code sits left of the number the way a
          phone number is read in every locale. */}
      <div className="flex gap-2" dir="ltr">
        <select
          name={countryName}
          aria-label={t("countryLabel")}
          className="input w-auto shrink-0 ps-2 pe-1 text-base"
          value={iso}
          onChange={(event) => setIso(event.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} +{c.dial}
            </option>
          ))}
        </select>

        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          dir="ltr"
          required={required}
          className="input flex-1 text-start"
          placeholder={country?.example}
          defaultValue={defaultValue ?? ""}
          autoComplete="tel-national"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
      </div>

      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-absent">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {country
            ? t("hint", { country: countryLabel(country), example: country.example })
            : hint}
        </p>
      )}
    </div>
  );
}
