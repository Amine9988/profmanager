import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_LOCALE_NAME } from "@/lib/i18n";

const VALID_LOCALES = new Set(["fr", "ar", "en"]);
const DEFAULT_LOCALE = "fr";
const SESSION_COOKIE = "pm_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/",
  "/_next/",
  "/favicon.ico",
];

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

  const pathname = request.nextUrl.pathname;

  if (process.env.AUTH_MODE === "accounts") {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

    // Only redirect page navigations (GET). Server actions POST to the page URL
    // and must reach the handler so redirect() inside the action preserves the
    // Flight JSON protocol (otherwise the client throws "Upstream response was
    // not valid JSON").
    if (request.method === "GET" && !isPublic && !hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Server actions: block writes early with a clean 401 JSON instead of an HTML page.
    if (request.method === "POST" && !isPublic && !hasSession) {
      const isServerAction = request.headers.has("next-action");
      if (isServerAction) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      }
    }

    // If already logged in and visiting /login, go to overview
    if (pathname === "/login" && hasSession && request.method === "GET") {
      const url = request.nextUrl.clone();
      url.pathname = "/overview";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
