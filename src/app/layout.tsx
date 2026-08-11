import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { LanBaseProvider } from "@/components/lan-base-provider";
import { getInitialLocale, getT, getDirection } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata() {
  const locale = await getInitialLocale();
  const t = await getT();
  return {
    title: {
      default: t("metadata.title_default"),
      template: t("metadata.title_template"),
    },
    description: t("metadata.description"),
    keywords: ["professeur", "cours particuliers", "gestion scolaire", "présence", "paiements", "forfaits"],
    authors: [{ name: "ProfManager" }],
    openGraph: {
      type: "website",
      locale: locale === "fr" ? "fr_FR" : locale === "ar" ? "ar_DZ" : "en_US",
      siteName: "ProfManager",
      title: t("metadata.title_default"),
      description: t("metadata.og_description"),
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getInitialLocale();

  return (
    <html
      lang={locale}
      dir={getDirection(locale as Locale)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanBaseProvider />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
