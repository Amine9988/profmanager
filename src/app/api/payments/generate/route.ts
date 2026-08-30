import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { calculateStatus } from "@/lib/payments/utils";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;

  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const { tenantId, supabase } = ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const year = body.year || new Date().getFullYear();
    const month = body.month || new Date().getMonth() + 1;
    const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const now = new Date().toISOString();

    // Prefetch existing payments for this month in one query (no N+1)
    const { data: existingRows } = await supabase
      .from("payments")
      .select("studentId")
      .eq("tenantId", tenantId)
      .eq("month", firstOfMonth);
    const existingSet = new Set((existingRows || []).map((r: any) => r.studentId));

    // Page through fee-paying students instead of loading unbounded set
    const PAGE = 200;
    let page = 1;
    let created = 0;
    let skipped = 0;
    let advancesUsed = 0;
    const errors: string[] = [];
    let total = 0;

    for (;;) {
      const offset = (page - 1) * PAGE;
      const { data: activeStudents, error: studentsErr } = await supabase
        .from("students")
        .select("id, fullName, monthlyFee, billingType, advanceBalance")
        .eq("tenantId", tenantId)
        .eq("status", "active")
        .gt("monthlyFee", 0)
        .order("fullName", { ascending: true })
        .range(offset, offset + PAGE - 1);

      if (studentsErr) {
        return NextResponse.json({ error: studentsErr.message }, { status: 500 });
      }
      const batch = activeStudents || [];
      if (batch.length === 0) break;
      total += batch.length;

      const toInsert: Record<string, unknown>[] = [];
      const advanceUpdates: { id: string; advanceBalance: number }[] = [];

      for (const student of batch) {
        if (student.billingType === "per_session") {
          skipped++;
          continue;
        }
        if (existingSet.has(student.id)) {
          skipped++;
          continue;
        }

        const amountDue = Number(student.monthlyFee);
        let advanceBalance = Number(student.advanceBalance || 0);
        let amountPaid = 0;

        if (advanceBalance > 0) {
          const deduction = Math.min(advanceBalance, amountDue);
          amountPaid = deduction;
          advanceBalance -= deduction;
          advanceUpdates.push({ id: student.id, advanceBalance });
          advancesUsed++;
        }

        const status = calculateStatus(amountDue, amountPaid, new Date(firstOfMonth));
        toInsert.push({
          id: randomUUID(),
          tenantId,
          studentId: student.id,
          month: firstOfMonth,
          amountDue,
          amountPaid,
          status,
          paidAt: status === "paid" ? now : null,
          createdAt: now,
          updatedAt: now,
        });
        existingSet.add(student.id);
      }

      for (const u of advanceUpdates) {
        await supabase.from("students").update({ advanceBalance: u.advanceBalance }).eq("id", u.id);
      }

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from("payments").insert(toInsert);
        if (insertErr) {
          // Fallback row-by-row for this chunk only
          for (const row of toInsert) {
            const { error } = await supabase.from("payments").insert(row);
            if (error) errors.push(`${row.studentId}: ${error.message}`);
            else created++;
          }
        } else {
          created += toInsert.length;
        }
      }

      if (batch.length < PAGE) break;
      page++;
    }

    return NextResponse.json({
      created,
      skipped,
      advances_used: advancesUsed,
      total,
      errors: errors.length > 0 ? errors : undefined,
      month: firstOfMonth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
