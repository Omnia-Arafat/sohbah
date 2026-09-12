"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { matchesSearch } from "@/lib/arabic-search";
import { pageOf } from "@/lib/quran/reference";
import { JUZ_COUNT, JUZ_STARTS } from "@/lib/quran/structure";
import { SURAHS, surahByNumber } from "@/lib/quran/surahs";

/**
 * Two ways in, because people look for a place in the mushaf two ways: by the
 * surah they are memorising, and by the جزء they are revising.
 *
 * Both resolve to a PAGE, which is the reader's only address. The mapping is
 * computed from the generated boundary tables rather than fetched — the whole
 * index is 114 + 30 lookups over data the client already has, so this screen
 * costs no request at all.
 */
export function MushafIndexClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("mushaf");
  const router = useRouter();

  const [tab, setTab] = useState<"surahs" | "juz">("surahs");
  const [query, setQuery] = useState("");
  const [pageInput, setPageInput] = useState("");

  const surahs = useMemo(
    () =>
      SURAHS.map((surah) => ({
        ...surah,
        page: pageOf({ surah: surah.number, ayah: 1 }),
      })),
    [],
  );

  const filtered = useMemo(() => {
    if (query.trim().length === 0) return surahs;
    return surahs.filter((surah) =>
      // The same matcher the rest of the app searches names with, given the
      // undecorated spelling as well — «الكهف» has to find ٱلْكَهۡفِ.
      matchesSearch(
        `${surah.name} ${surah.plain} ${surah.number} ${surah.englishName}`,
        query,
      ),
    );
  }, [surahs, query]);

  const juz = useMemo(
    () =>
      Array.from({ length: JUZ_COUNT }, (_, at) => {
        const [surah, ayah] = JUZ_STARTS[at];
        return {
          number: at + 1,
          page: pageOf({ surah, ayah }),
          opensWith: surahByNumber(surah),
        };
      }),
    [],
  );

  function jump(event: React.FormEvent) {
    event.preventDefault();
    const page = Number(pageInput);
    if (!Number.isInteger(page) || page < 1 || page > 604) return;
    router.push(`/${academySlug}/mushaf/${page}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("indexTitle")}</h1>

      <form onSubmit={jump} className="flex gap-2">
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={604}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          placeholder={t("jumpPlaceholder")}
          aria-label={t("jumpTitle")}
        />
        <button type="submit" className="btn-secondary shrink-0">
          {t("jumpTitle")}
        </button>
      </form>

      <div
        role="tablist"
        className="grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-muted p-1.5"
      >
        <TabButton
          active={tab === "surahs"}
          onClick={() => setTab("surahs")}
          label={t("tabs.surahs")}
        />
        <TabButton
          active={tab === "juz"}
          onClick={() => setTab("juz")}
          label={t("tabs.juz")}
        />
      </div>

      {tab === "surahs" ? (
        <>
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground"
            />
            <input
              className="input ps-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchSurah")}
              aria-label={t("searchSurah")}
            />
          </label>

          {filtered.length === 0 ? (
            <p className="card text-sm text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <ul className="card p-0">
              {filtered.map((surah) => (
                <li key={surah.number} className="border-b border-border-subtle last:border-0">
                  <Link
                    href={`/${academySlug}/mushaf/${surah.page}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                                 bg-surface-muted text-xs font-bold tabular-nums text-muted-foreground"
                    >
                      {surah.number}
                    </span>
                    <span className="min-w-0 flex-grow">
                      <span className="block truncate font-quran text-lg leading-snug">
                        {locale === "ar" ? surah.name : surah.englishName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("surahMeta", {
                          ayahs: t("ayahs", { count: surah.ayahs }),
                          page: surah.page,
                        })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <ul className="card grid grid-cols-2 gap-2 sm:grid-cols-3">
          {juz.map((entry) => (
            <li key={entry.number}>
              <Link
                href={`/${academySlug}/mushaf/${entry.page}`}
                className="flex flex-col rounded-xl border border-border-subtle px-3 py-2.5
                           transition-colors hover:border-brand-600 hover:bg-surface-muted"
              >
                <span className="text-sm font-bold">
                  {t("juz", { juz: entry.number })}
                </span>
                <span className="truncate font-quran text-sm text-muted-foreground">
                  {entry.opensWith?.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t("juzMeta", { page: entry.page })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-11 rounded-xl text-sm transition-colors focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? "bg-surface font-bold text-foreground shadow-sm"
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  }`}
    >
      {label}
    </button>
  );
}
