import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const monthsBack = 12;
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const { data: students } = await supabase
      .from("students")
      .select("enrolledAt")
      .eq("tenantId", tenantId)
      .gte("enrolledAt", since.toISOString());

    const byMonth = new Map<string, number>();
    for (const s of students || []) {
      const d = new Date(s.enrolledAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }

    return NextResponse.json(
      Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
    );
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
