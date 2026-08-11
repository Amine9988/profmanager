import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_LOCALE_NAME } from "@/lib/i18n";

const VALID_LOCALES = new Set(["fr", "ar", "en"]);
const DEFAULT_LOCALE = "fr";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const locale = request.cookies.get(COOKIE_LOCALE_NAME)?.value;
  if (!locale || !VALID_LOCALES.has(locale)) {
    request.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE);
    response.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE, {
      path: "/",
      maxAge: 31536000,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
