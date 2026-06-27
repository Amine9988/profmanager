"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Locale } from "./i18n";

export const VALID_LOCALES = new Set(["fr", "ar", "en"]);
export const COOKIE_LOCALE_NAME = "locale";
export const defaultLocale: Locale = "fr";

const LocaleCtx = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [resolved] = useState<Locale>(() => {
    if (typeof document === "undefined") return locale;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_LOCALE_NAME}=([^;]*)`));
    const val = match?.[1];
    return val && VALID_LOCALES.has(val) ? (val as Locale) : locale;
  });
  return <LocaleCtx.Provider value={resolved}>{children}</LocaleCtx.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleCtx);
  if (ctx !== null) return ctx;
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_LOCALE_NAME}=([^;]*)`));
  const val = match?.[1];
  return val && VALID_LOCALES.has(val) ? (val as Locale) : defaultLocale;
}
