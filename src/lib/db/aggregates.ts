import { getDb } from "@/lib/db/supabase-shim";

/** Fast SQL aggregates for cash_movements — avoids loading every row into JS. */
export async function cashMovementStats(tenantId: string) {
  const db = await getDb();
  const escape = (s: string) => s.replace(/'/g, "''");
  const tid = escape(tenantId);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const firstOfMonth = `${y}-${m}-01`;
  const lastOfMonth = `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`;

  const sum = (sql: string) => {
    const r = db.exec(sql);
    return Number(r?.[0]?.values?.[0]?.[0] ?? 0) || 0;
  };

  const totalIncome = sum(`SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE tenantId='${tid}' AND type='income'`);
  const totalExpense = sum(`SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE tenantId='${tid}' AND type='expense'`);
  const monthIncome = sum(`SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE tenantId='${tid}' AND type='income' AND date>='${firstOfMonth}' AND date<='${lastOfMonth}'`);
  const monthExpense = sum(`SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE tenantId='${tid}' AND type='expense' AND date>='${firstOfMonth}' AND date<='${lastOfMonth}'`);

  const catRows = db.exec(
    `SELECT category, type, COALESCE(SUM(amount),0) FROM cash_movements WHERE tenantId='${tid}' GROUP BY category, type`
  );
  const byCategory: Record<string, { income: number; expense: number }> = {};
  if (catRows?.[0]?.values) {
    for (const row of catRows[0].values) {
      const cat = String(row[0] || "general");
      const type = String(row[1] || "");
      const amt = Number(row[2]) || 0;
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
      if (type === "income") byCategory[cat].income += amt;
      else byCategory[cat].expense += amt;
    }
  }

  return {
    balance: totalIncome - totalExpense,
    totalIncome,
    totalExpense,
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    byCategory,
  };
}

export async function paymentStatusCounts(tenantId: string, month: string) {
  const db = await getDb();
  const escape = (s: string) => s.replace(/'/g, "''");
  const tid = escape(tenantId);
  const monthPrefix = escape(String(month).slice(0, 7));
  const count = (sql: string) => Number(db.exec(sql)?.[0]?.values?.[0]?.[0] ?? 0) || 0;

  // Same rule as isPaymentOverdue, counted per unique student (not payment rows).
  const monthMatch = `substr(month, 1, 7) = '${monthPrefix}'`;
  const unpaid = `CAST(amountPaid AS REAL) < CAST(amountDue AS REAL)`;
  const overdueRule = `(
    CAST(amountPaid AS REAL) > 0
    OR date('now', 'localtime') > date('${monthPrefix}-01', '+1 month', '-1 day')
    OR CAST(strftime('%d', 'now', 'localtime') AS INTEGER) > 10
  )`;

  const overdue = count(
    `SELECT COUNT(DISTINCT studentId) FROM payments WHERE tenantId='${tid}' AND ${monthMatch} AND ${unpaid} AND ${overdueRule}`
  );
  const total = count(
    `SELECT COUNT(DISTINCT studentId) FROM payments WHERE tenantId='${tid}' AND ${monthMatch}`
  );

  return { overdue, partial: 0, total };
}
