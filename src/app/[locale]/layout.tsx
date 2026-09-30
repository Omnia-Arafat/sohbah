import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Amiri, Cairo } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "@/components/query-provider";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#08130f" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });

  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("description"),
    applicationName: t("name"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("name"),
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      title: t("name"),
      description: t("description"),
      locale: locale === "ar" ? "ar_SA" : "en_US",
      type: "website",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={localeDirection[locale as Locale]}
      className={`${cairo.variable} ${amiri.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#4A5568" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/*
          If the stylesheet did not apply — a page saved under an older deploy,
          or a download that dropped on a weak signal — the student gets bare
          HTML. `body` is `flex` only when the CSS is there, so reload once;
          the session flag stops it from looping when the network is simply
          gone, and is cleared as soon as a page loads styled.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `addEventListener("load",function(){try{var k="sohbah-css-retry";if(getComputedStyle(document.body).display==="flex"){sessionStorage.removeItem(k);return}if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");location.reload()}catch(e){}})`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
