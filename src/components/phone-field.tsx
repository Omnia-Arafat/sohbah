"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry } from "@/lib/phone";

/**
 * A country picker glued to the number input.
 *
 * The closed field is deliberately narrow — a flag and a dial code — so the
 * number itself keeps the width, while the open list spells each country out by
 * name. It is a real `<select>`: on a phone that opens the native wheel, which
 * beats any custom dropdown for a معلمة entering a queue of students on her way
 * to a circle.
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

  /**
   * React resets the form once a server action returns, and a native reset puts
   * a `<select>` back to its first option. React does not re-assert a
   * controlled value that has not changed since the last render, so the picker
   * silently snapped back to مصر while the flag and the placeholder still read
   * اليمن — and the next submit would have carried the wrong country. Running
   * after every render puts the DOM back in step with the choice.
   */
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (selectRef.current && selectRef.current.value !== iso) {
      selectRef.current.value = iso;
    }
  });

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>

      {/* dir="ltr" on the row, so the code sits left of the number the way a
          phone number is read in every locale. */}
      <div className="flex gap-2" dir="ltr">
        {/* The flag is an image sitting on top of the select, not a character
            inside it: `<option>` renders text only, and the emoji flag draws as
            two letters on Windows. So the field always shows the real flag of
            the chosen country, and the list spells the country out by name —
            which is what a reader scans for anyway. */}
        <div className="relative shrink-0">
          <img
            src={`/flags/${iso.toLowerCase()}.svg`}
            alt=""
            aria-hidden="true"
            width={24}
            height={18}
            className="pointer-events-none absolute start-2.5 top-1/2 h-[18px] w-6
                       -translate-y-1/2 rounded-[3px] object-cover
                       ring-1 ring-black/10 dark:ring-white/15"
          />
          <select
            ref={selectRef}
            name={countryName}
            aria-label={t("countryLabel")}
            className="input w-auto ps-11 pe-1 text-base"
            value={iso}
            onChange={(event) => setIso(event.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {/* U+200E before the '+': inside an Arabic option the bidi
                    algorithm otherwise flips it to "20+". */}
                {countryLabel(c)} {"‎+"}
                {c.dial}
              </option>
            ))}
          </select>
        </div>

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
