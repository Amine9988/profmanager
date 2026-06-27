"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Globe } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { getDirection } from "@/lib/i18n";

const locales: { id: Locale; tKey: string }[] = [
  { id: "fr", tKey: "locale.fr" },
  { id: "ar", tKey: "locale.ar" },
  { id: "en", tKey: "locale.en" },
];

export function SettingsLanguageCard() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();

  const handleClick = useCallback((lang: Locale) => {
    document.cookie = `locale=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />{t("settings.language")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {locales.map((l) => (
            <Button
              key={l.id}
              variant={locale === l.id ? "default" : "outline"}
              className="justify-center gap-2"
              onClick={() => handleClick(l.id)}
              dir={getDirection(l.id)}
            >
              {locale === l.id && <Check className="size-4" />}
              {t(l.tKey)}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
