import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const firstOfMonth = `${y}-${m}-01`;
    const lastOfMonth = `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`;

    const { data: allMovements } = await supabase
      .from("cash_movements")
      .select("type, amount, date, category")
      .eq("tenantId", tenantId);

    const income = (allMovements || [])
      .filter((m: any) => m.type === "income")
      .reduce((s: number, m: any) => s + Number(m.amount), 0);
    const expense = (allMovements || [])
      .filter((m: any) => m.type === "expense")
      .reduce((s: number, m: any) => s + Number(m.amount), 0);

    const monthMovements = (allMovements || []).filter(
      (m: any) => m.date >= firstOfMonth && m.date <= lastOfMonth
    );
    const monthIncome = monthMovements
      .filter((m: any) => m.type === "income")
      .reduce((s: number, m: any) => s + Number(m.amount), 0);
    const monthExpense = monthMovements
      .filter((m: any) => m.type === "expense")
      .reduce((s: number, m: any) => s + Number(m.amount), 0);

    const byCategory: Record<string, { income: number; expense: number }> = {};
    for (const m of allMovements || []) {
      const cat = m.category || "general";
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
      if (m.type === "income") byCategory[cat].income += Number(m.amount);
      else byCategory[cat].expense += Number(m.amount);
    }

    return NextResponse.json({
      balance: income - expense,
      totalIncome: income,
      totalExpense: expense,
      monthIncome,
      monthExpense,
      monthBalance: monthIncome - monthExpense,
      byCategory,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
