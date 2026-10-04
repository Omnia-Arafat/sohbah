"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { clearMe, getMe, meKey, subscribeMe } from "@/lib/me-store";

/**
 * The header's account button for anyone who is not signed-in staff.
 *
 * The layout knows only the Supabase session, and a student has none: her
 * sign-in is her browser's (me-store). So the header kept offering «تسجيل
 * الدخول» to a student who had just signed in, while صفحتي showed her name and
 * «خروج» — two answers to "am I in?" on one screen.
 *
 * `signedIn` is the server's guess from the student cookie, so the first paint
 * already shows the right button; the stored identity takes over once the
 * page is live, and a sign-in or sign-out anywhere on the page updates it.
 */
export function StudentHeaderAccount({
  academySlug,
  signedIn,
}: {
  academySlug: string;
  signedIn: boolean;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key) !== null, [key]),
    () => signedIn,
  );

  if (me) {
    return (
      <button
        type="button"
        onClick={() => {
          clearMe(key);
          router.replace(`/${academySlug}`);
          router.refresh();
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle
                   px-3 py-1.5 text-sm font-semibold text-muted-foreground
                   transition-colors hover:border-absent hover:text-absent
                   whitespace-nowrap"
      >
        <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("signOut")}
      </button>
    );
  }

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
