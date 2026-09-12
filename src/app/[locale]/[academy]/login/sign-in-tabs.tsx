"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  GraduationCap,
  Info,
  Shield,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Two tabs, not three.
 *
 * A معلمة and a مشرفة sign in through exactly the same form — phone and
 * password — because the role is decided at registration, not at the door. A
 * third tab would ask the same two questions and teach people a difference
 * that does not exist.
 *
 * The real split is between people who sign in and a person who never does.
 * So the student tab carries no form at all: showing her an empty login she
 * can never fill is how she ends up messaging her معلمة to ask for a password
 * that was never issued.
 *
 * The student tab opens by default for nobody — the staff tab does. Staff are
 * the ones who came here to sign IN; a student who lands here took a wrong
 * turn, and the tab she needs is one tap away and clearly labelled.
 */
export function SignInTabs({
  academySlug,
  staffForm,
}: {
  academySlug: string;
  /** The existing `<TeacherLoginForm>`, unchanged and rendered as-is. */
  staffForm: ReactNode;
}) {
  const t = useTranslations("auth");
  const [tab, setTab] = useState<"staff" | "student">("staff");

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="grid grid-cols-2 gap-1.5 bg-surface-muted p-1.5"
      >
        <TabButton
          active={tab === "staff"}
          onClick={() => setTab("staff")}
          Icon={GraduationCap}
          label={t("tabs.staff")}
        />
        <TabButton
          active={tab === "student"}
          onClick={() => setTab("student")}
          Icon={UserRound}
          label={t("tabs.student")}
        />
      </div>

      <div className="p-5">
        {tab === "staff" ? (
          <>
            {staffForm}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("studentsNote")}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            {/* The whole point, stated before anything is offered. */}
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/40">
              <Info
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"
              />
              <p className="text-sm leading-relaxed text-brand-800 dark:text-brand-200">
                {t("student.notice")}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Link href={`/${academySlug}/register`} className="btn-primary w-full">
                <UserRoundPlus aria-hidden="true" className="h-5 w-5" />
                {t("student.register")}
              </Link>

              {/* Not in the original design — it did not exist then. For a
                  student who IS registered, this is the one door on this page
                  that actually opens onto something of hers. */}
              <Link href={`/${academySlug}/me`} className="btn-secondary w-full">
                <UserRound aria-hidden="true" className="h-5 w-5" />
                {t("student.myPage")}
              </Link>

              <Link href={`/${academySlug}/schedule`} className="btn-secondary w-full">
                <CalendarDays aria-hidden="true" className="h-5 w-5" />
                {t("student.today")}
              </Link>
            </div>

            <div className="border-t border-border-subtle pt-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                <b className="text-foreground">{t("student.returningTitle")}</b>{" "}
                {t("student.returningBody")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Admin is a third door and it is deliberately the quietest thing on the
          screen: one or two people use it, and they know it is here. */}
      <div className="flex items-center justify-center gap-1.5 border-t border-border-subtle px-5 py-3">
        <Shield aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        <Link
          href={`/${academySlug}/admin`}
          className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("adminSignIn")}
        </Link>
      </div>
    </div>
  );
}

/** One segment of the tab strip — the same shape the quiz tabs use. */
function TabButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof UserRound;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl
                  text-sm transition-colors focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? "bg-surface font-bold text-foreground shadow-sm"
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-[18px] w-[18px] ${
          active ? "text-brand-600 dark:text-brand-300" : ""
        }`}
      />
      {label}
    </button>
  );
}
