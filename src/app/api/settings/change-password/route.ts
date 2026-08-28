import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/auth-server";

const DEFAULT_PASSWORD = "profmanager1234";

export async function POST(req: NextRequest) {
  try {
    const { userId, supabase } = await getTenantContext();
    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }

    const { data: user } = await supabase
      .from("users")
      .select("passwordHash")
      .eq("id", userId)
      .single();

    const passwordHash = (user as any)?.passwordHash as string | null;

    if (passwordHash) {
      const valid = verifyPassword(currentPassword, passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "wrong_password" }, { status: 401 });
      }
    } else {
      if (currentPassword !== DEFAULT_PASSWORD) {
        return NextResponse.json({ error: "wrong_password" }, { status: 401 });
      }
    }

    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    // ROOT FIX: users table is empty on fresh installs — default-user has no row.
    // `update` affects 0 rows and silently succeeds, so the new password is never
    // persisted and the next verify still expects DEFAULT_PASSWORD.
    // Insert if the user row does not exist yet, otherwise update.
    let persistError: any = null;
    if (!user) {
      const r = await supabase
        .from("users")
        .insert({ id: userId, passwordHash: newHash, createdAt: now, updatedAt: now });
      persistError = r.error;
    } else {
      const r = await supabase
        .from("users")
        .update({ passwordHash: newHash, updatedAt: now })
        .eq("id", userId);
      persistError = r.error;
    }

    if (persistError) {
      return NextResponse.json({ error: persistError.message || "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
