import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Protected path segments — any route whose path contains one of these
 * segments requires a signed-in teacher or admin.
 * e.g. /ar/sohbah/dashboard  →  rest = /sohbah/dashboard  →  protected ✓
 *      /ar/sohbah/admin/...  →  rest = /sohbah/admin/...  →  protected ✓
 */
const PROTECTED_SEGMENTS = ["dashboard", "admin"];

const handleI18n = createMiddleware(routing);

/** Strips the locale prefix from a pathname and returns both parts. */
function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { locale, rest: "/" };
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, rest: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: null, rest: pathname };
}

/**
 * The admin landing page is its own sign-in screen, so a signed-out visitor
 * has to be allowed to reach it — redirecting them to the teachers' page would
 * defeat the point of giving out `/admin` as an address. Everything *below*
 * `/admin` stays protected, and the page itself renders a form rather than any
 * data until `requireStaffSession()` / `requireAdminSession()` is satisfied.
 *
 *   /sohbah/admin          → open (renders the sign-in form)
 *   /sohbah/admin/teachers → protected
 */
function isAdminLanding(pathname: string) {
  return /^\/[^/]+\/admin\/?$/.test(pathname);
}

function isProtected(pathname: string) {
  if (isAdminLanding(pathname)) return false;
  const segments = pathname.split("/").filter(Boolean);
  return segments.some((seg) => PROTECTED_SEGMENTS.includes(seg));
}

/**
 * Presence check only — never trusted for its contents. The real auth check
 * lives in `@/lib/auth/dal` next to the data.
 *
 * `@supabase/ssr` writes `sb-<project-ref>-auth-token`, split into
 * `.0`, `.1`… chunks when the token is large.
 */
function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
}

/**
 * Refreshes the Supabase session so Server Components see a valid cookie.
 * Students never sign in — this is a no-op for them.
 */
function refreshSupabaseSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  return supabase.auth.getUser();
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guard protected routes before any rendering begins.
  const { locale, rest } = splitLocale(pathname);
  if (isProtected(rest) && !hasAuthCookie(request)) {
    const url = request.nextUrl.clone();
    const localePrefix = locale ? `/${locale}` : "/ar";
    url.pathname = `${localePrefix}/sohbah/login`;
    url.search = "";
    url.searchParams.set("next", rest);
    return NextResponse.redirect(url);
  }

  const response = handleI18n(request);
  await refreshSupabaseSession(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
