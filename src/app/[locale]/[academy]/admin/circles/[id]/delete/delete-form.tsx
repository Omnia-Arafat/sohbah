"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deleteCircle } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.circles");

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

type DeleteCircleFormProps = {
  circleId: string;
  circleName: string;
  academySlug: string;
  attendanceCount: number;
};

export function DeleteCircleForm({
  circleId,
  circleName,
  academySlug,
  attendanceCount,
}: DeleteCircleFormProps) {
  const t = useTranslations("admin.circles");
  const [state, formAction] = useActionState(deleteCircle, { status: "idle" });

  return (
    <div className="card border-absent space-y-4">
      <p className="font-medium">{circleName}</p>
      <p className="text-sm text-muted-foreground">
        {t("deleteBody", { name: circleName, count: attendanceCount })}
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="circleId" value={circleId} />
        <input type="hidden" name="academySlug" value={academySlug} />

        {state.status === "error" && (
          <p className="text-sm text-absent">{state.message}</p>
        )}

        <div className="flex gap-3">
          <Link
            href={`/${academySlug}/admin/circles`}
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
