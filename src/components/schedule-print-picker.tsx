"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { arNum } from "@/lib/schedule-format";

export type PickerSheet = {
  /** encodeSheet(): trackId.cohortId|base.week */
  ref: string;
  label: string;
  /** The track's own schedule rather than one cohort's copy. */
  base: boolean;
};

/**
 * «هتطبعي لمين؟»: the same schedule, one sheet per place it applies to, each
 * with its own track, cohort and week on top. Opens the print page with the
 * ticked sheets; PDF comes from the browser's own «حفظ كـ PDF».
 */
export function SchedulePrintPicker({
  academySlug,
  sheets,
  backHref,
  title = "هتطبعي لمين؟",
}: {
  academySlug: string;
  sheets: PickerSheet[];
  backHref: string;
  title?: string;
}) {
  const [on, setOn] = useState<boolean[]>(() => sheets.map(() => true));
  const picked = sheets.filter((_, i) => on[i]);
  const all = picked.length === sheets.length;

  const params = new URLSearchParams();
  for (const s of picked) params.append("s", s.ref);
  params.set("back", backHref);
  const href = `/${academySlug}/print/schedule?${params.toString()}`;

  const count =
    picked.length === 1 ? "ورقة واحدة" : picked.length === 2 ? "ورقتين" : `${arNum(picked.length)} ورقات`;

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="text-sm font-semibold text-muted-foreground">
          نفس الجدول، وكل ورقة مكتوب فوقها المسار والدفعة والأسبوع بتوعها.
        </p>
      </div>

      <div role="group" aria-label="الأوراق" className="flex flex-col gap-2">
        {sheets.map((s, i) => (
          <button
            key={s.ref}
            type="button"
            role="checkbox"
            aria-checked={on[i]}
            onClick={() => setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2 text-start transition-colors ${
              on[i] ? "border-2 border-brand-500 bg-brand-50" : "border border-border-subtle bg-surface"
            }`}
          >
            <span
              className={`flex size-6 flex-none items-center justify-center rounded-lg ${
                on[i] ? "bg-brand-600 text-white" : "border-2 border-border-subtle bg-surface"
              }`}
            >
              {on[i] && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="font-bold">{s.label}</span>
              <span className={`text-xs font-bold ${s.base ? "text-brand-700" : "text-maroon-600"}`}>
                {s.base ? "الجدول الأساسي للمسار" : "نسخة خاصة بالدفعة"}
              </span>
            </span>
          </button>
        ))}
      </div>

      {sheets.length > 1 && (
        <button
          type="button"
          onClick={() => setOn(sheets.map(() => !all))}
          className="self-start text-sm font-bold text-brand-700"
        >
          {all ? "شيلي الكل" : "اختاري الكل"}
        </button>
      )}

      {picked.length > 0 ? (
        <Link href={href} className="btn-primary">
          <Download className="size-5" aria-hidden="true" />
          اطبعي أو نزّلي {count}
        </Link>
      ) : (
        <p className="text-sm font-semibold text-muted-foreground">اختاري ورقة واحدة على الأقل.</p>
      )}
    </section>
  );
}
