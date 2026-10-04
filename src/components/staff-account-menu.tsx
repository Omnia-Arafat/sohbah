"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/use-my-record";

/**
 * The header's account button for signed-in staff: her name, and a menu that
 * says every role she holds — أدمن, مشرفة, معلمة, and طالبة when her student
 * side is linked in this browser — above «خروج».
 *
 * One account holds all of them at once; nothing here switches between them.
 * The roles are shown so she can see what the app is treating her as.
 */
export function StaffAccountMenu({
  academySlug,
  name,
  roles,
  signOutAction,
}: {
  academySlug: string;
  name: string;
  /** Already translated, highest first. */
  roles: string[];
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("nav");
  const tSide = useTranslations("studentHome.staffSide");
  const { me } = useMe(academySlug);
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

  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const allRoles = me ? [...roles, tSide("studentChip")] : roles;

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex h-10 max-w-[10rem] items-center gap-1.5 rounded-full border ps-1.5 pe-2.5 transition-colors ${
          open ? "border-brand-600 bg-brand-50 dark:bg-brand-900" : "border-border-subtle bg-surface"
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white">
          {name.trim().charAt(0)}
        </span>
        <span className="truncate text-sm font-bold">{firstName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute end-0 top-12 z-50 flex w-64 flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-3.5 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-900 text-base font-bold text-white">
              {name.trim().charAt(0)}
            </span>
            <span className="truncate font-bold">{name}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allRoles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold text-foreground/80"
              >
                {role}
              </span>
            ))}
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-absent/40
                         text-sm font-bold text-absent transition-colors hover:bg-absent/5"
            >
              <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              {t("signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
