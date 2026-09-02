import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

const productionCache = new Map<string, Messages>();

/**
 * Development reads `messages/*.json` from disk on every request.
 *
 * `await import()` is the obvious way to load these, but Next caches the
 * resulting module and the file lives outside the watched source tree — so
 * editing a translation left the old strings in memory and the UI rendered raw
 * keys (`admin.teachers.tabs.teacher`) until the whole server was restarted.
 * A disk read per request costs nothing at dev traffic levels and removes that
 * trap entirely.
 *
 * Production keeps the bundled import: `process.cwd()` is not a reliable place
 * to find the file once deployed, and the messages cannot change at runtime
 * anyway, so it is read once and memoized.
 */
async function loadMessages(locale: string): Promise<Messages> {
  if (process.env.NODE_ENV !== "production") {
    const file = path.join(process.cwd(), "messages", `${locale}.json`);
    return JSON.parse(await readFile(file, "utf8")) as Messages;
  }

  const cached = productionCache.get(locale);
  if (cached) return cached;

  const messages = (await import(`../../messages/${locale}.json`))
    .default as Messages;
  productionCache.set(locale, messages);
  return messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
