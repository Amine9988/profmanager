"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

const order = ["fr", "ar", "en"];

const display: Record<string, string> = {
  fr: "FR",
  ar: "AR",
  en: "EN",
};

function getCookieLocale(): string {
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
  return match?.[1] ?? "fr";
}

export function LanguageSwitcher() {
  const router = useRouter();
  const [current, setCurrent] = useState("FR");

  useEffect(() => {
    const val = getCookieLocale();
    setCurrent(display[val] ?? "FR");
  }, []);

  const next = useCallback(() => {
    const raw = getCookieLocale();
    const idx = order.indexOf(raw);
    const nextLang = order[(idx + 1) % order.length];
    document.cookie = `locale=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return (
    <Button variant="ghost" size="sm" onClick={next} suppressHydrationWarning className="text-muted-foreground hover:text-foreground gap-1.5">
      <Languages className="size-3.5" />
      <span className="text-xs font-semibold">{current}</span>
    </Button>
  );
}
