"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { DateField } from "@/components/date-field";

/**
 * «كان لي عذر».
 *
 * Deliberately NOT a way to mark the day done. The card says «تمّ بفضل الله»,
 * so a day she could not do must never be closed by writing a سرد that did
 * not happen. What she can do is ask, and a معلمة decides — which is also the
 * only shape the record allows: `track_absences.created_by` is a teacher, and
 * an excuse nobody accepted is not an excuse.
 */
export function ExcuseClient({
  academySlug,
  today,
}: {
  academySlug: string;
  today: string;
}) {
  const t = useTranslations("excuse");
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);
  // The track this page is for: named by ?e= only when she is on several.
  const requested = useSearchParams().get("e");
  const trackArg = requested ? { p_enrollment_id: requested } : {};
  const trackSuffix = requested ? `?e=${requested}` : "";

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        {t("signInFirst")}{" "}
        <Link href={`/${academySlug}`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  async function send() {
    if (!me) return;
    setSending(true);
    setState("idle");
    const { error } = await supabase.rpc("ask_for_excuse" as never, {
      p_student_id: me.studentId,
      p_phone: me.phone,
      p_date: date,
      p_reason: reason,
      ...trackArg,
    } as never);
    setSending(false);
    setState(error ? "error" : "sent");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {state === "sent" ? (
        <section className="card border-present/40 bg-present/5">
          <p className="font-semibold text-present">{t("sent")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("sentNote")}</p>
          <Link
            href={`/${academySlug}/me/track${trackSuffix}`}
            className="btn-primary mt-4 inline-flex min-h-11 items-center"
          >
            {t("backToDay")}
          </Link>
        </section>
      ) : (
        <>
          {state === "error" && (
            <p
              role="alert"
              className="rounded-2xl border border-absent/40 bg-absent/5 px-4 py-3 text-sm text-absent"
            >
              {t("failed")}
            </p>
          )}

          <div className="card flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="excuseDate">
                {t("day")}
              </label>
              <DateField id="excuseDate" max={today} value={date} onChange={setDate} />
            </div>

            <div>
              <label className="field-label" htmlFor="reason">
                {t("reason")}
              </label>
              <textarea
                id="reason"
                dir="rtl"
                rows={3}
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("reasonPlaceholder")}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("reasonHint")}</p>
            </div>

            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="btn-primary min-h-12 w-full disabled:opacity-60"
            >
              {sending ? t("sending") : t("send")}
            </button>
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}
