"use client";

import { createContext, useContext, type ReactNode, useMemo } from "react";
import type { Locale } from "./i18n";
import { allMessages, resolve, replaceParams, defaultLocale, COOKIE_LOCALE_NAME, VALID_LOCALES } from "./i18n";

const LocaleCtx = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

function getClientLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_LOCALE_NAME}=([^;]*)`));
  const val = match?.[1];
  return val && VALID_LOCALES.has(val) ? (val as Locale) : defaultLocale;
}

function useLocaleFromContext(): Locale {
  const ctx = useContext(LocaleCtx);
  if (ctx !== null) return ctx;
  return getClientLocale();
}

export function useLocale(): Locale {
  return useLocaleFromContext();
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const locale = useLocaleFromContext();
  const dict = allMessages[locale] as unknown as Record<string, unknown>;
  return useMemo(() => (key: string, params?: Record<string, string | number>) => {
    const raw = resolve(dict, key);
    return params ? replaceParams(raw, params) : raw;
  }, [dict]);
}

export function useI18n() {
  const locale = useLocaleFromContext();
  const direction = locale === "ar" ? "rtl" : "ltr";
  return { locale, direction, t: useT() };
}

export function useCurrency(): string {
  return "DZD";
}

export function useSetLocale(): (locale: Locale) => void {
  throw new Error("useSetLocale is deprecated. Use LanguageSwitcher or SettingsLanguageCard instead.");
}

export function useSetCurrency(): (currency: string) => void {
  return () => {};
}
