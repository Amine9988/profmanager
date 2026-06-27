import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, Wallet, BarChart3, Check } from "lucide-react";
import { getT, getInitialLocale } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getInitialLocale();
  const t = await getT();
  return {
    title: t("metadata.title_default"),
    description: t("metadata.description"),
    openGraph: {
      title: t("metadata.title_default"),
      description: t("metadata.og_description"),
      locale: locale === "fr" ? "fr_FR" : locale === "ar" ? "ar_DZ" : "en_US",
    },
  };
}

const featureIcons = [Users, CalendarCheck, Wallet, BarChart3];

export default async function LandingPage() {
  const t = await getT();

  return (
    <div className="flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold">ProfManager</span>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">{t("auth.login_button")}</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">{t("auth.free_trial")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {t("marketing.hero_title")}
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          {t("marketing.hero_desc")}
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/signup">{t("marketing.hero_cta")}</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("marketing.hero_note")}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => {
            const Icon = featureIcons[i - 1];
            return (
              <Card key={i}>
                <CardHeader>
                  <Icon className="mb-2 size-8 text-primary" />
                  <CardTitle className="text-base">{t(`marketing.feature_${i}_title`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t(`marketing.feature_${i}_desc`)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold">{t("marketing.pricing_title")}</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className={i === 2 ? "border-primary shadow-md" : ""}>
              <CardHeader>
                <CardTitle>{t(`marketing.plan_${i}_name`)}</CardTitle>
                <p className="text-3xl font-bold">{t(`marketing.plan_${i}_price`)}</p>
                <p className="text-sm text-muted-foreground">{t(`marketing.plan_${i}_desc`)}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {[1, 2, 3, 4].map((f) => {
                    const feat = t(`marketing.plan_${i}_feature_${f}`);
                    if (!feat || feat === `marketing.plan_${i}_feature_${f}`) return null;
                    return (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-success" /> {feat}
                      </li>
                    );
                  })}
                </ul>
                <Button className="mt-6 w-full" variant={i === 2 ? "default" : "outline"} asChild>
                  <Link href="/signup">{t("marketing.plan_cta", { name: t(`marketing.plan_${i}_name`) })}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        {t("marketing.footer", { year: "2026" })}
      </footer>
    </div>
  );
}
