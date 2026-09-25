"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Search } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { matchesSearch } from "@/lib/arabic-search";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";

type Option = {
  enrollment_id: string;
  student_name: string;
  father_name: string;
  is_current: boolean;
};

/**
 * اختيار الرفيقة.
 *
 * Two ways to answer, because the academy's own wording allows both: a
 * sister on the same دفعة, or «حد من بره سردلها» — someone the system will
 * never have a row for. The second is not a fallback for a missing feature;
 * it is a real answer, so it gets a real field rather than an "other" hidden
 * at the bottom.
 */
export function PartnerClient({ academySlug }: { academySlug: string }) {
  const t = useTranslations("partner");
  const router = useRouter();
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [options, setOptions] = useState<Option[] | null>(null);
  const [query, setQuery] = useState("");
  const [outside, setOutside] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (me && loadedFor !== me.studentId) {
    setLoadedFor(me.studentId);
    void (async () => {
      const { data } = await supabase.rpc("my_partner_options" as never, {
        p_student_id: me.studentId,
        p_phone: me.phone,
      } as never);
      setOptions((data ?? []) as unknown as Option[]);
    })();
  }

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        {t("signInFirst")}{" "}
        <Link href={`/${academySlug}/me`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  const trimmed = query.trim();
  const shown =
    options === null
      ? []
      : trimmed === ""
        ? options
        : options.filter(
            (o) =>
              matchesSearch(o.student_name, trimmed) ||
              matchesSearch(o.father_name, trimmed),
          );

  async function choose(enrollmentId: string | null, name: string | null) {
    if (!me) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("set_my_partner" as never, {
      p_student_id: me.studentId,
      p_phone: me.phone,
      p_partner_enrollment_id: enrollmentId,
      p_external_name: name,
    } as never);
    setSaving(false);
    if (rpcError) {
      setError("failed");
      return;
    }
    router.push(`/${academySlug}/me/track`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-absent/40 bg-absent/5 px-4 py-3 text-sm text-absent"
        >
          {t("failed")}
        </p>
      )}

      {/* Someone outside the system is a real answer, so it sits first and
          whole rather than hidden under the list as an afterthought. */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        <label className="field-label" htmlFor="outside">
          {t("outside")}
        </label>
        <input
          id="outside"
          className="input"
          dir="rtl"
          value={outside}
          onChange={(event) => setOutside(event.target.value)}
          placeholder={t("outsidePlaceholder")}
        />
        <button
          type="button"
          disabled={saving || outside.trim() === ""}
          onClick={() => choose(null, outside.trim())}
          className="btn-primary mt-3 min-h-11 w-full disabled:opacity-50"
        >
          {t("save")}
        </button>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface">
        <p className="px-4 pt-4 text-sm font-bold">{t("fromCohort")}</p>

        <div className="relative px-4 pt-3">
          <Search
            className="pointer-events-none absolute inset-inline-start-7 top-6 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor="partnerSearch">
            {t("search")}
          </label>
          <input
            id="partnerSearch"
            type="search"
            className="input"
            placeholder={t("search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {options === null ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            {options.length === 0 ? t("aloneInCohort") : t("noMatch")}
          </p>
        ) : (
          <ul className="mt-3">
            {shown.map((o) => (
              <li key={o.enrollment_id} className="border-t border-border-subtle">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => choose(o.enrollment_id, null)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-start transition-colors hover:bg-surface-muted disabled:opacity-60"
                >
                  <span className="min-w-0 flex-grow truncate text-sm">
                    {o.student_name}
                    {o.father_name && (
                      <span className="text-muted-foreground"> {o.father_name}</span>
                    )}
                  </span>
                  {o.is_current && (
                    <span
                      aria-label={t("current")}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}
