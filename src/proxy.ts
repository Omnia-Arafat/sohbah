import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routing, type Locale } from "@/i18n/routing";
import { STUDENT_COOKIE } from "@/lib/student-cookie";

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
 * The pages a stranger may open. Nothing else on the site renders for someone
 * who is neither a signed-in معلمة nor a signed-in student: the academy's home
 * page is itself the sign-in screen, and these are the ways to become known.
 *
 *   /sohbah                   → the door (sign in)
 *   /sohbah/login             → the same door, by its old address
 *   /sohbah/register          → a new student
 *   /sohbah/register-teacher  → a new معلمة
 *   /sohbah/install           → adding the app to the phone
 *   /sohbah/admin             → the admin door (see isAdminLanding)
 */
const OPEN_PAGES = ["", "login", "register", "register-teacher", "install"];

/**
 * Sections a stranger may open at any depth: the challenges. Anyone handed a
 * challenge's link can open it and count — the count is kept on her phone —
 * and signing in is only what sends it to the server for her مشرفة to see.
 *
 *   /sohbah/challenges   → the list (its challenges for everyone)
 *   /sohbah/c/<link>     → one challenge
 *   /sohbah/friday/...   → تحدي الجمعة, its الكهف and its share image
 *
 * /sohbah/challenges/new and …/manage guard themselves with
 * requireTeacherSession, so opening the section does not open them.
 */
const OPEN_SECTIONS = ["challenges", "c", "friday"];

function isOpenToStrangers(pathname: string) {
  if (pathname === "/") return true;
  if (isAdminLanding(pathname)) return true;
  const [, ...after] = pathname.split("/").filter(Boolean);
  if (OPEN_SECTIONS.includes(after[0] ?? "")) return true;
  return after.length <= 1 && OPEN_PAGES.includes(after[0] ?? "");
}

function hasStudentCookie(request: NextRequest) {
  return Boolean(request.cookies.get(STUDENT_COOKIE)?.value);
}

/**
 * Refreshes the Supabase session so Server Components see a valid cookie.
 * Only called when an auth cookie exists — students never sign in.
 *
 * `getClaims()` verifies the JWT locally against the project's cached JWKS
 * and only talks to Supabase Auth when the token has expired and needs
 * refreshing; `getUser()` made that round trip on every page view.
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

  return supabase.auth.getClaims();
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

  // Everyone else who is not known yet goes to the door, and back after.
  // A path with no locale is left to next-intl, which redirects it to one;
  // the gate runs on that second request.
  if (
    locale &&
    !isOpenToStrangers(rest) &&
    !hasAuthCookie(request) &&
    !hasStudentCookie(request)
  ) {
    const academy = rest.split("/").filter(Boolean)[0] ?? "sohbah";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/${academy}`;
    url.search = "";
    url.searchParams.set("next", rest + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const response = handleI18n(request);
  if (hasAuthCookie(request)) await refreshSupabaseSession(request, response);
  return response;
}

/**
 * Pages only. `_next` covers static chunks, image optimization and data
 * routes; anything with a dot — favicon, icons, sw.js, the manifest,
 * /quran/* — is a public file and never reaches the proxy.
 */
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
