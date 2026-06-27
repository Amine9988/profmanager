import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_LOCALE_NAME } from "@/lib/i18n";

const VALID_LOCALES = new Set(["fr", "ar", "en"]);
const DEFAULT_LOCALE = "fr";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth", "/_next", "/api/public", "/api/auth"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Locale handling
  const locale = request.cookies.get(COOKIE_LOCALE_NAME)?.value;
  if (!locale || !VALID_LOCALES.has(locale)) {
    request.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE);
    supabaseResponse.cookies.set(COOKIE_LOCALE_NAME, DEFAULT_LOCALE, {
      path: "/",
      maxAge: 31536000,
    });
  }

  // Public route check
  const isPublic =
    request.nextUrl.pathname === "/" ||
    PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));
  if (isPublic) {
    return supabaseResponse;
  }

  // Auth check
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}
