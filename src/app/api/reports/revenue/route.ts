import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const monthsBack = 12;
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    since.setDate(1);

    const { data: payments } = await supabase
      .from("payments")
      .select("amountPaid, month")
      .eq("tenantId", tenantId)
      .gte("month", `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`);

    const byMonth = new Map<string, number>();
    for (const p of payments || []) {
      const d = new Date(p.month);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amountPaid));
    }

    return NextResponse.json(
      Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }))
    );
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
