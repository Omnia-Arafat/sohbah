"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, type Country } from "@/lib/phone";

/**
 * A country picker glued to the number input.
 *
 * Not a native `<select>`, which is where this started: an `<option>` renders
 * text and nothing else, so the flag could only sit outside the closed field
 * and the open list showed a blank gap where every flag should have been —
 * padding with nothing in it. The browser's own popup is also the one piece of
 * furniture on the page that ignores the academy's styling entirely.
 *
 * So it follows `SearchableSelect`: a button and a panel drawn with the app's
 * own tokens, and a hidden input carrying the value, which means the server
 * action still just reads `formData.get("phoneCountry")`. No search box —
 * thirty countries fit in a scroll, and the ones these academies serve are at
 * the top.
 *
 * Two names are submitted: `phoneCountry` (ISO) and `phone` (national digits).
 * The server joins them into E.164, so the browser never decides the format.
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
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [iso, setIso] = useState(
    () => findCountry(defaultCountry)?.iso ?? DEFAULT_COUNTRY,
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const country = findCountry(iso) ?? COUNTRIES[0];
  const label_ = (c: Country) => (locale === "ar" ? c.nameAr : c.nameEn);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function commit(c: Country) {
    setIso(c.iso);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(COUNTRIES.findIndex((c) => c.iso === iso));
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, COUNTRIES.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      if (open && COUNTRIES[activeIndex]) {
        event.preventDefault();
        commit(COUNTRIES[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  /** The dial code is Latin digits inside Arabic text; the LRM keeps it "+20". */
  const dial = (c: Country) => `‎+${c.dial}`;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>

      {/* dir="ltr" on the row, so the code sits left of the number the way a
          phone number is read in every locale. */}
      <div className="flex gap-2" dir="ltr">
        <div ref={rootRef} className="relative shrink-0">
          <input type="hidden" name={countryName} value={iso} />
          <button
            type="button"
            aria-label={t("countryLabel")}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            onClick={() => {
              setOpen((wasOpen) => !wasOpen);
              setActiveIndex(COUNTRIES.findIndex((c) => c.iso === iso));
            }}
            onKeyDown={handleKeyDown}
            className="input flex w-auto items-center gap-2 px-3"
          >
            <Flag country={country} />
            <span className="text-base">{dial(country)}</span>
            <svg
              viewBox="0 0 12 8"
              aria-hidden="true"
              className={`h-2 w-3 fill-current text-muted-foreground transition-transform
                          ${open ? "rotate-180" : ""}`}
            >
              <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          </button>

          {open && (
            <ul
              id={listboxId}
              role="listbox"
              // Wider than the button it hangs off, so a country's name fits.
              className="combobox-panel !w-[15rem]"
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              {COUNTRIES.map((c, index) => (
                <li
                  key={`${c.iso}-${c.dial}`}
                  role="option"
                  aria-selected={c.iso === iso}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    commit(c);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-base
                              transition-colors ${
                                index === activeIndex
                                  ? "bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                                  : ""
                              } ${c.iso === iso ? "font-semibold" : ""}`}
                >
                  <Flag country={c} />
                  <span className="flex-1">{label_(c)}</span>
                  <span className="text-sm text-muted-foreground">{dial(c)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          dir="ltr"
          required={required}
          className="input flex-1 text-start"
          placeholder={country.example}
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
          {country ? t("hint", { country: label_(country), example: country.example }) : hint}
        </p>
      )}
    </div>
  );
}

/**
 * An image, not an emoji: Windows ships no font that draws flag emoji, so 🇪🇬
 * renders there as the letters "EG". The SVGs are in `public/flags`.
 */
function Flag({ country }: { country: Country }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 2KB static SVG
    // already the right size; next/image would add a request and optimise
    // nothing, since it does not process SVG anyway.
    <img
      src={`/flags/${country.iso.toLowerCase()}.svg`}
      alt=""
      aria-hidden="true"
      width={24}
      height={18}
      className="h-[18px] w-6 shrink-0 rounded-[3px] object-cover
                 ring-1 ring-black/10 dark:ring-white/15"
    />
  );
}
