import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/[locale]/[academy]/login/actions";

/**
 * Two states that are neither an error nor a working session:
 *  - `notLinked`: signed in, but no `teachers` row points at this auth user.
 *  - `inactive`: the teacher row exists but was deactivated.
 * Both need an explanation and a way out, not a redirect loop.
 */
export async function TeacherAccountNotice({
  reason,
  email,
  academySlug,
}: {
  reason: "notLinked" | "inactive";
  email: string | null;
  academySlug?: string;
}) {
  const t = await getTranslations("auth");

  const signOutWithAcademy = signOut.bind(null, academySlug ?? "");

  return (
    <div className="card border-accent-300 bg-accent-100 text-accent-700">
      <h2 className="text-lg font-semibold">{t(`${reason}.title`)}</h2>
      <p className="mt-2 text-sm">{t(`${reason}.body`)}</p>

      {email && (
        <p className="mt-3 text-sm">
          {t("signedInAs")}{" "}
          <span className="font-semibold" dir="ltr">
            {email}
          </span>
        </p>
      )}

      <form action={signOutWithAcademy} className="mt-4">
        <button type="submit" className="btn-secondary w-full sm:w-auto">
          {t("signOutAndSwitch")}
        </button>
      </form>
    </div>
  );
}
