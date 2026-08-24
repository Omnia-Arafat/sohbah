"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deleteStudent } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.students");

  return (
    <button
      type="submit"
      className="btn-primary w-full bg-absent hover:bg-red-700"
      disabled={pending}
    >
      {pending ? t("deleting") : t("delete")}
    </button>
  );
}

type DeleteStudentFormProps = {
  studentId: string;
  studentName: string;
  academySlug: string;
  attendanceCount: number;
};

export function DeleteStudentForm({
  studentId,
  studentName,
  academySlug,
  attendanceCount,
}: DeleteStudentFormProps) {
  const t = useTranslations("admin.students");
  const [state, formAction] = useActionState(deleteStudent, { status: "idle" });

  return (
    <div className="card border-absent space-y-4">
      <p className="font-medium">{studentName}</p>
      <p className="text-sm text-muted-foreground">
        {t("deleteBody", { name: studentName, count: attendanceCount })}
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="academySlug" value={academySlug} />

        {state.status === "error" && (
          <p className="text-sm text-absent">{state.message}</p>
        )}

        <div className="flex gap-3">
          <Link
            href={`/${academySlug}/admin/students`}
            className="btn-secondary flex-1 text-center"
          >
            {t("cancel")}
          </Link>
          <div className="flex-1">
            <SubmitButton />
          </div>
        </div>
      </form>
    </div>
  );
}
