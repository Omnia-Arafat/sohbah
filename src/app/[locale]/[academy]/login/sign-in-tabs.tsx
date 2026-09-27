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
import { StudentDoor } from "./student-door";

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
  next = null,
}: {
  academySlug: string;
  /** The existing `<TeacherLoginForm>`, unchanged and rendered as-is. */
  staffForm: ReactNode;
  /** Where the site's front door turned her away from; she goes back there. */
  next?: string | null;
}) {
  const t = useTranslations("auth");
  const [tab, setTab] = useState<"staff" | "student">("student");

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-[0_2px_16px_rgba(14,31,25,0.06)]">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="grid grid-cols-2 gap-1.5 border-b border-border-subtle bg-surface-muted p-1.5"
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
              She signs in right here, with the name and phone she registered
              with. This used to be a button to صفحتي; now that nothing on the
              site opens before she is known, the form is the door itself.
            */}
            <StudentDoor academySlug={academySlug} next={next} />

            <div className="border-t border-border-subtle pt-5">
              <p className="mb-2.5 text-center text-sm text-muted-foreground">
                {t("student.newHere")}
              </p>
              <Link href={`/${academySlug}/register`} className="btn-secondary w-full">
                <UserRoundPlus aria-hidden="true" className="h-5 w-5" />
                {t("student.register")}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Admin is a third door and it is deliberately the quietest thing on the
          screen: one or two people use it, and they know it is here. */}
      <Link
        href={`/${academySlug}/admin`}
        className="flex items-center justify-center gap-1.5 border-t border-border-subtle
                   bg-surface-muted px-5 py-3.5 text-xs font-semibold text-muted-foreground
                   transition-colors hover:text-foreground"
      >
        <Shield aria-hidden="true" className="h-3.5 w-3.5" />
        {t("adminSignIn")}
      </Link>
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
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl
                  text-sm transition-colors focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? // The active tab is the academy's green, not a white
                        // card on grey. Two near-white rectangles side by side
                        // made you read the labels to find out which one you
                        // were on.
                        "bg-brand-600 font-bold text-white shadow-sm"
                      : "font-semibold text-muted-foreground hover:bg-surface hover:text-foreground"
                  }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-[18px] w-[18px] ${active ? "text-white" : ""}`}
      />
      {label}
    </button>
  );
}
