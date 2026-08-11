import { COOKIE_LOCALE_NAME } from "@/lib/i18n";
import { NextResponse, type NextRequest } from "next/server";

const VALID_LOCALES = new Set(["fr", "ar", "en"]);
const DEFAULT_LOCALE = "fr";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const locale = request.cookies.get(COOKIE_LOCALE_NAME)?.value;
  if (!locale || !VALID_LOCALES.has(locale)) {
    request.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE);
    supabaseResponse.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE, {
      path: "/",
      maxAge: 31536000,
    });
  }

  return supabaseResponse;
}
