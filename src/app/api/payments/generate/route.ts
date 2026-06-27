import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { calculateStatus } from "@/lib/payments/utils";

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

    const { data: activeStudents, error: studentsErr } = await supabase
      .from("students")
      .select("id, fullName, monthlyFee, billingType, advanceBalance")
      .eq("tenantId", tenantId)
      .eq("status", "active")
      .gt("monthlyFee", 0);

    if (studentsErr) {
      return NextResponse.json({ error: studentsErr.message }, { status: 500 });
    }

    let created = 0;
    let skipped = 0;
    let advancesUsed = 0;
    const errors: string[] = [];

    for (const student of activeStudents || []) {
      if (student.billingType === "per_session") {
        skipped++;
        continue;
      }

      const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("tenantId", tenantId)
        .eq("studentId", student.id)
        .eq("month", firstOfMonth)
        .maybeSingle();

      if (existing) {
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
        await supabase.from("students").update({ advanceBalance }).eq("id", student.id);
        advancesUsed++;
      }

      const status = calculateStatus(amountDue, amountPaid, new Date(firstOfMonth));
      const paidAt = status === "paid" ? now : null;

      const insertFields: Record<string, unknown> = {
        id: crypto.randomUUID(),
        tenantId,
        studentId: student.id,
        month: firstOfMonth,
        amountDue,
        amountPaid,
        status,
        paidAt,
        createdAt: now,
        updatedAt: now,
      };

      // receiptNumber / receiptSequence columns removed from schema — skip

      const { error: insertErr } = await supabase.from("payments").insert(insertFields);

      if (insertErr) {
        errors.push(`${student.fullName}: ${insertErr.message}`);
      } else {
        created++;
      }
    }

    return NextResponse.json({
      created,
      skipped,
      advances_used: advancesUsed,
      total: (activeStudents || []).length,
      errors: errors.length > 0 ? errors : undefined,
      month: firstOfMonth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
