import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <div className="card text-center">
      <h1 className="font-display text-2xl font-bold">{t("notFound")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/" className="btn-secondary mt-4">
        {t("backHome")}
      </Link>
    </div>
  );
}
