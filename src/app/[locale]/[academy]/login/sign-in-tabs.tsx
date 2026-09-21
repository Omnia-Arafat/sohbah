"use client";

import { useState, type ReactNode } from "react";
import {
  GraduationCap,
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
 * THE STUDENT TAB COMES FIRST, and opens. The staff tab held that place on the
 * reasoning that staff are the ones who came here to sign IN — true, and
 * beside the point: this academy has a hundred and thirteen students and a few
 * dozen معلمات, so the screen opens on the person most likely to be reading
 * it. A معلمة signing in knows she is staff and the tab says so; a student
 * does not necessarily know she is not.
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
  const [tab, setTab] = useState<"staff" | "student">("student");

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="grid grid-cols-2 gap-1.5 bg-surface-muted p-1.5"
      >
        <TabButton
          active={tab === "student"}
          onClick={() => setTab("student")}
          Icon={UserRound}
          label={t("tabs.student")}
        />
        <TabButton
          active={tab === "staff"}
          onClick={() => setTab("staff")}
          Icon={GraduationCap}
          label={t("tabs.staff")}
        />
      </div>

      <div className="p-5">
        {tab === "staff" ? (
          <>
            {staffForm}

            {/*
              Registering used to be one grey line under the whole card, below
              the fold on a phone — so a new معلمة scrolled past the form she
              could not fill and found nothing. The two things a person can do
              here are sign in and make an account; they belong next to each
              other, and the second one is a button like the first.
            */}
            <div className="mt-5 border-t border-border-subtle pt-5">
              <p className="mb-2.5 text-center text-sm text-muted-foreground">
                {t("noAccountYet")}
              </p>
              <Link
                href={`/${academySlug}/register-teacher`}
                className="btn-secondary w-full"
              >
                <UserRoundPlus aria-hidden="true" className="h-5 w-5" />
                {t("registerAccount")}
              </Link>
            </div>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("studentsNote")}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            {/*
              Two doors, named the way she would name them: she is either new
              here or she is coming back. The panel used to open with a notice
              explaining that students have no account and no password — true,
              but it answered a question nobody had asked yet and pushed both
              buttons down the screen. صفحتي is that door, so it is labelled
              تسجيل الدخول rather than by its destination.

              حلقات اليوم used to be a third button and is not one any more:
              الجدول is a permanent tab in the bar at the bottom of every
              screen, so putting it here was offering a door that is already
              open.
            */}
            <div className="flex flex-col gap-2">
              <Link href={`/${academySlug}/register`} className="btn-primary w-full">
                <UserRoundPlus aria-hidden="true" className="h-5 w-5" />
                {t("student.register")}
              </Link>

              <Link href={`/${academySlug}/me`} className="btn-secondary w-full">
                <UserRound aria-hidden="true" className="h-5 w-5" />
                {t("student.signIn")}
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
