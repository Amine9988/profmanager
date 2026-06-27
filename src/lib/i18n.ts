import fr from "@/messages/fr.json";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

export type Locale = "ar" | "en" | "fr";
export const COOKIE_LOCALE_NAME = "locale";
export const defaultLocale: Locale = "fr";
export const localeNames: Record<Locale, string> = { fr: "Français", ar: "العربية", en: "English" };

export const allMessages = { fr, ar, en } as const;
export const VALID_LOCALES = new Set(["fr", "ar", "en"]);

export function resolve(obj: Record<string, unknown>, key: string): string {
  const keys = key.split(".");
  let current: unknown = obj;
  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }
  return typeof current === "string" ? current : key;
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function replaceParams(template: string, params: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

// ---- Server-only (uses dynamic imports to avoid bundling next/headers in clients) ----

export async function getLocale(): Promise<Locale> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const val = store.get(COOKIE_LOCALE_NAME)?.value;
  return val && VALID_LOCALES.has(val) ? (val as Locale) : defaultLocale;
}

export const getInitialLocale = getLocale;

export async function getT(locale?: Locale): Promise<(key: string, params?: Record<string, string | number>) => string> {
  const resolved = locale ?? await getLocale();
  const dict = allMessages[resolved] as unknown as Record<string, unknown>;
  return (key: string, params?: Record<string, string | number>) => {
    const raw = resolve(dict, key);
    return params ? replaceParams(raw, params) : raw;
  };
}

export async function getCurrency(): Promise<{ code: string; locale: string }> {
  return { code: "DZD", locale: "ar-DZ" };
}

export const messages = allMessages;

// ---- Re-export client hooks from the client-only module ----

export { useT, useLocale, useI18n, useCurrency, useSetLocale, useSetCurrency } from "./i18n-context";
