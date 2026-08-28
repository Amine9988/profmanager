import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-server";

const DEFAULT_PASSWORD = "profmanager1234";

export async function POST(req: NextRequest) {
  try {
    const { userId, supabase } = await getTenantContext();
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const { data: user } = await supabase
      .from("users")
      .select("passwordHash")
      .eq("id", userId)
      .single();

    const passwordHash = (user as any)?.passwordHash as string | null;

    if (!passwordHash) {
      if (password === DEFAULT_PASSWORD) {
        return NextResponse.json({ verified: true });
      }
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const valid = verifyPassword(password, passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
