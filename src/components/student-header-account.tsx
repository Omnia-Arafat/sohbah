"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, LogIn, LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { clearMe, getMe, meKey, subscribeMe, type Me } from "@/lib/me-store";
import { realFatherName } from "@/lib/student-name";

/**
 * The header's account button for anyone who is not signed-in staff.
 *
 * The layout knows only the Supabase session, and a student has none: her
 * sign-in is her browser's (me-store). For a signed-in student this is her
 * name, and tapping it opens a small menu with «خروج» — the name card that sat
 * at the top of صفحتي lives here now, on every page, instead of on one.
 *
 * `signedIn` is the server's guess from the student cookie, so the first paint
 * already shows a name chip rather than «تسجيل الدخول»; the name itself fills
 * in once her browser is read.
 */
export function StudentHeaderAccount({
  academySlug,
  signedIn,
}: {
  academySlug: string;
  signedIn: boolean;
}) {
  const t = useTranslations("nav");
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore<Me | "pending" | null>(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => (signedIn ? "pending" : null),
  );

  if (me) return <AccountMenu academySlug={academySlug} meKeyName={key} me={me} />;

  return (
    <Link
      href={`/${academySlug}/login`}
      prefetch={false}
      className="inline-flex items-center gap-1.5 rounded-xl border border-brand-600
                 bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand-700
                 transition-colors hover:bg-brand-100
                 dark:bg-brand-900 dark:text-brand-200 whitespace-nowrap"
    >
      <LogIn className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      {t("signIn")}
    </Link>
  );
}

function AccountMenu({
  academySlug,
  meKeyName,
  me,
}: {
  academySlug: string;
  meKeyName: string;
  me: Me | "pending";
}) {
  const t = useTranslations("nav");
  const tAccount = useTranslations("studentHome.account");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = me === "pending" ? "" : me.name.trim();
  const firstName = name.split(/\s+/)[0] ?? "";

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={name ? tAccount("label", { name }) : tAccount("labelPending")}
        className={`inline-flex h-10 max-w-[10rem] items-center gap-1.5 rounded-full border ps-1.5 pe-2.5
                    transition-colors ${
                      open
                        ? "border-brand-600 bg-brand-50 dark:bg-brand-900"
                        : "border-border-subtle bg-surface"
                    }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {name ? name.charAt(0) : <UserRound className="h-4 w-4" aria-hidden="true" />}
        </span>
        {firstName && <span className="truncate text-sm font-bold">{firstName}</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="absolute end-0 top-12 z-50 flex w-60 flex-col gap-3 rounded-2xl border border-border-subtle
                     bg-surface p-3.5 shadow-lg"
        >
          {me !== "pending" && (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">
                {name.charAt(0)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold leading-tight">{name}</span>
                {realFatherName(me.fatherName) && (
                  <span className="truncate text-xs text-muted-foreground">{me.fatherName}</span>
                )}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              clearMe(meKeyName);
              router.replace(`/${academySlug}`);
              router.refresh();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-absent/40
                       text-sm font-bold text-absent transition-colors hover:bg-absent/5"
          >
            <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
