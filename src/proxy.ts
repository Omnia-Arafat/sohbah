import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LOCALE_COOKIE, routing, type Locale } from "@/i18n/routing";

/** Everything below these prefixes requires a signed-in teacher or admin. */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/**
 * `localeDetection: false` keeps Arabic as the default for every first-time
 * visitor regardless of their browser's Accept-Language. The saved preference is
 * honoured explicitly below instead, so switching to English sticks but an
 * en-US browser does not silently override the Arabic default.
 */
const handleI18n = createMiddleware({ ...routing, localeDetection: false });

function hasLocalePrefix(pathname: string) {
  return routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}

/** Splits `/en/dashboard/new` into the locale and the locale-free `/dashboard/new`. */
function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { locale, rest: "/" };
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, rest: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: null, rest: pathname };
}

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Presence check only — the cookie is never trusted for its contents. Proxy runs
 * on prefetches too, so a database round trip here would be costly; the real
 * check lives in `@/lib/auth/dal`, next to the data.
 *
 * `@supabase/ssr` writes `sb-<project-ref>-auth-token`, split into `.0`, `.1`…
 * chunks when the token is large.
 */
function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
}

/**
 * Refreshes the teacher/admin auth session so Server Components see a valid
 * cookie. Students never sign in, so this is a no-op for them.
 */
function refreshSupabaseSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Lets the app boot before Supabase credentials are filled in.
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
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;

  // Someone who chose English earlier lands on an unprefixed (Arabic) URL:
  // send them to the English equivalent.
  if (saved === "en" && !hasLocalePrefix(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // Turn anonymous visitors away before the teacher pages start rendering, and
  // remember where they were going so signing in lands them there.
  const { locale, rest } = splitLocale(pathname);
  if (isProtected(rest) && !hasAuthCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = `${locale ? `/${locale}` : ""}/login`;
    url.search = "";
    url.searchParams.set("next", rest);
    return NextResponse.redirect(url);
  }

  const response = handleI18n(request);
  await refreshSupabaseSession(request, response);
  return response;
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
