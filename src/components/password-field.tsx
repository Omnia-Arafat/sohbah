"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * A password input with a show/hide toggle.
 *
 * Passwords here get typed on a phone, often a number-and-letter mix dictated
 * over WhatsApp, so being able to check what was typed prevents a lot of failed
 * sign-ins.
 *
 * Physical `right`/`pr` rather than logical `end`/`pe`: the field is `dir="ltr"`
 * so its text always starts on the left, regardless of the page being Arabic —
 * which puts the eye on the right in both languages.
 */
export function PasswordField({
  id,
  name,
  autoComplete,
  invalid,
  describedBy,
  defaultValue,
}: {
  id: string;
  name: string;
  autoComplete: "new-password" | "current-password";
  invalid?: boolean;
  describedBy?: string;
  defaultValue?: string;
}) {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const labelId = useId();

  return (
    <div className="relative" dir="ltr">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        dir="ltr"
        className="input pr-12 text-start"
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        // Not in the tab order: a sighted mouse user can reach it, and keyboard
        // users are not made to tab past a decoration to get to the next field.
        tabIndex={-1}
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        title={visible ? t("hidePassword") : t("showPassword")}
        id={labelId}
        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2
                   items-center justify-center rounded-lg text-muted-foreground
                   transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
