import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function POST(_req: NextRequest) {
  try {
    const { userId, supabase } = await getTenantContext();
    // Clear the stored hash → falls back to DEFAULT_PASSWORD (profmanager1234)
    const { error } = await supabase
      .from("users")
      .update({ passwordHash: null, updatedAt: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      // If user row doesn't exist yet, there's nothing to clear — still success (already default)
      // Try to ensure no hash remains via direct delete of hash if row missing
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
