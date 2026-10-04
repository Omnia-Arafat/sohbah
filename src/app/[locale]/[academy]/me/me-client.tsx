"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Me } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";
import { realFatherName } from "@/lib/student-name";
import type { StudentSearchResult } from "@/lib/database.types";

/**
 * The student's name-and-phone sign-in. صفحتي itself is gone — her record is
 * the home screen now (components/student-record.tsx) and /me redirects there
 * — but the form lives on here, where the front door imports it from.
 */

// =============================================================================
// Signing in without an account
// =============================================================================

export function SignIn({
  academySlug,
  onFound,
  bare = false,
}: {
  academySlug: string;
  onFound: (me: Me) => void;
  /** Inside the front door's tab: no page heading and no card of its own. */
  bare?: boolean;
}) {
  const t = useTranslations("me");
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"notFound" | "error" | "tooMany" | "slow" | null>(null);

  /**
   * More than one student on this phone matched the name typed.
   *
   * A family shares a line here, and a mother's name often contains her
   * child's — «ام ياسين» and «ياسين طارق». Choosing for her was landing a
   * student on someone else's record, so when the answer is not unique the
   * screen asks instead of guessing.
   */
  const [choices, setChoices] = useState<StudentSearchResult[] | null>(null);

  function findMe(signal: AbortSignal) {
    return supabase
      .rpc("find_me", { p_academy_slug: academySlug, p_name: name, p_phone: phone })
      .abortSignal(signal);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    /*
      Never leave her on «جارٍ البحث…».

      The request had no limit and nothing caught a failure, so a network that
      drops the request (a weak signal, a carrier that blocks the database's
      domain) or a browser that throws left the button busy forever, with no
      word of what to do. Now it gives up after fifteen seconds and says so.
    */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let result: Awaited<ReturnType<typeof findMe>> | null = null;
    try {
      result = await findMe(controller.signal);
    } catch (failure) {
      console.error("find_me threw", failure);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }

    if (!result || controller.signal.aborted) {
      setError("slow");
      return;
    }

    const { data, error: rpcError } = result;

    if (rpcError) {
      console.error("find_me failed", rpcError);
      setError("error");
      return;
    }

    const matches = data ?? [];

    if (matches.length === 0) {
      setError("notFound");
      return;
    }

    // Five is the function's own cap. Hitting it means the name was typed too
    // loosely to identify anybody, not that five sisters share a phone.
    if (matches.length >= 5) {
      setError("tooMany");
      return;
    }

    if (matches.length > 1) {
      setChoices(matches);
      return;
    }

    pick(matches[0]);
  }

  function pick(found: StudentSearchResult) {
    onFound({
      studentId: found.id,
      name: found.name,
      fatherName: found.father_name,
      phone,
      genderCategory: found.gender_category,
    });
  }

  if (choices) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className={bare ? "text-lg font-semibold" : "font-display text-2xl font-bold"}>
            {t("signIn.chooseTitle")}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("signIn.chooseHint")}
          </p>
        </header>

        <div className={bare ? "flex flex-col gap-2" : "card flex flex-col gap-2 p-3"}>
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => pick(choice)}
              className="flex items-center gap-3 rounded-xl border border-border-subtle
                         px-4 py-3 text-start transition-colors hover:border-brand-600
                         hover:bg-surface-muted"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                           bg-brand-100 text-sm font-bold text-brand-800
                           dark:bg-brand-900 dark:text-brand-100"
              >
                {choice.name.trim().charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{choice.name}</span>
                {realFatherName(choice.father_name) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {choice.father_name}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setChoices(null)}
          className="btn-secondary w-full"
        >
          {t("signIn.chooseBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!bare && (
        <header>
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </header>
      )}

      <form onSubmit={submit} className={bare ? "flex flex-col gap-4" : "card flex flex-col gap-4"}>
        <div>
          <h2 className="text-lg font-semibold">{t("signIn.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("signIn.hint")}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="me-name">
            {t("signIn.name")}
          </label>
          <input
            id="me-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("signIn.namePlaceholder")}
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="me-phone">
            {t("signIn.phone")}
          </label>
          <input
            id="me-phone"
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("signIn.phonePlaceholder")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-absent" role="alert">
            {t(`signIn.${error}`)}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t("signIn.submitting") : bare ? t("signIn.submitDoor") : t("signIn.submit")}
        </button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("signIn.privacy")}
        </p>
      </form>

      {/*
        The other half of the pair. This screen and the registration form are
        sign-in and sign-up, and until now each was a dead end: a student who
        had never registered found a form that would only ever tell her
        «مش لاقيين اسمك», with nowhere to go from there. Same card, mirrored,
        on both screens — so whichever one she lands on, the other is one tap
        away.
      */}
      {/* At the front door the register button sits under the form already. */}
      {!bare && (
        <Link
          href={`/${academySlug}/register`}
          className="flex items-center justify-between gap-3 rounded-2xl border
                     border-border-subtle bg-surface p-4 transition-colors
                     hover:border-brand-600"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900">
              <UserRoundPlus
                aria-hidden="true"
                className="h-[18px] w-[18px] text-brand-600 dark:text-brand-300"
              />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-bold">{t("signIn.noAccount")}</span>
              <span className="text-xs text-muted-foreground">
                {t("signIn.noAccountBody")}
              </span>
            </span>
          </span>
          <ChevronLeft
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180"
          />
        </Link>
      )}
    </div>
  );
}
