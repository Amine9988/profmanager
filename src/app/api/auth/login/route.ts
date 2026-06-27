import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let email: string | null = null;
  let password: string | null = null;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const json = await request.json();
      email = json.email || null;
      password = json.password || null;
    } catch {
    }
  } else {
    try {
      const formData = await request.formData();
      email = formData.get("email") as string | null;
      password = formData.get("password") as string | null;
    } catch {
    }
  }

  const response = NextResponse.redirect(
    new URL("/overview", request.url),
    { status: 302 }
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: false,
              path: "/",
            });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email || "",
    password: password || "",
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 302 }
    );
  }

  if (!data?.session) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("No session returned")}`, request.url),
      { status: 302 }
    );
  }

  return response;
}
