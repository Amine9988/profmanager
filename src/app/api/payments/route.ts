import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { calculateStatus, normalizePayment, adjustSessionCredits } from "@/lib/payments/utils";
import { getOverdueSubscriptionsData } from "@/lib/payments/overdue";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const allParam = searchParams.get("all");
    const allTime = allParam === "1" || allParam === "true";
    const studentId = searchParams.get("studentId");
    const statusFilter = searchParams.get("status");
    const aggregate = searchParams.get("aggregate");

    if (aggregate === "overdue") {
      const data = await getOverdueSubscriptionsData();
      return NextResponse.json(data);
    }

    const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;

    let query = supabase
      .from("payments")
      .select("*, students(id, fullName, monthlyFee, group_students(*, groups(name)))")
      .eq("tenantId", tenantId);

    if (!allTime) query = query.eq("month", firstOfMonth);

    const { data: payments } = await query;

    const merged = (payments || []).map((p: any) => {
      const norm = normalizePayment(p as Record<string, unknown>) as any;
      const refDate = allTime
        ? (() => {
            const parts = String(norm.month || p.month || firstOfMonth).slice(0, 10).split("-").map(Number);
            return new Date(parts[0], (parts[1] || 1) - 1, 1);
          })()
        : new Date(firstOfMonth);
      const computedStatus = calculateStatus(Number(norm.amountDue), Number(norm.amountPaid), refDate);
      return {
        ...norm,
        student: {
          id: p.students?.id,
          fullName: p.students?.fullName,
          monthlyFee: p.students?.monthlyFee,
          groupStudents: p.students?.group_students,
        },
        students: undefined,
        status: computedStatus,
      };
    });

    if (studentId) {
      return NextResponse.json(merged.filter((p: any) => p.studentId === studentId));
    }
    if (statusFilter) {
      return NextResponse.json(merged.filter((p: any) => p.status === statusFilter));
    }
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase, userId } = await getTenantContext();
    const body = await req.json();
    const { studentId, month, amount, note, paymentDate, groupId } = body;

    if (!studentId || !month || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const paymentDateStr = paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
      ? paymentDate
      : new Date().toISOString().split("T")[0];
    const paymentDateTime = new Date(`${paymentDateStr}T00:00:00`);
    const paymentDateForMonth = `${month.slice(0, 7)}-01`;

    let amountDue = Number(amount);
    let sessionsIncluded: number | null = null;
    if (groupId) {
      const { data: group } = await supabase
        .from("groups")
        .select("pricePerSession, sessionsIncluded")
        .eq("id", groupId)
        .eq("tenantId", tenantId)
        .maybeSingle();
      if (group?.pricePerSession) amountDue = Number(group.pricePerSession);
      sessionsIncluded = group?.sessionsIncluded ? Number(group.sessionsIncluded) : null;
    } else {
      const { data: student } = await supabase
        .from("students")
        .select("monthlyFee")
        .eq("id", studentId)
        .eq("tenantId", tenantId)
        .maybeSingle();
      if (student?.monthlyFee) amountDue = Number(student.monthlyFee);
    }

// Each payment is its own row: no monthly merge and no cap per month —
    // the school tracks session packages, so several payments are allowed in
    // the same month. Every payment below also grants a fresh package.
    const status = calculateStatus(amountDue, Number(amount), new Date(paymentDateForMonth));
    // Record the date the money was actually received — even for partial payments.
    const paidAt = Number(amount) > 0 ? paymentDateTime.toISOString() : null;

    const insertFields: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenantId: tenantId,
      studentId: studentId,
      groupId: groupId || null,
      month: paymentDateForMonth,
      amountDue: amountDue,
      amountPaid: Number(amount),
      status,
      paidAt: paidAt,
      updatedAt: new Date().toISOString(),
    };
    if (note) insertFields.note = note;

    // receiptNumber / receiptSequence columns removed from schema — skip

    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert(insertFields)
      .select("*, students(id, fullName, monthlyFee, group_students(*, groups(name)))")
      .single();

    if (insertError || !payment) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create payment" },
        { status: 500 }
      );
    }

    if (Number(amount) > 0) {
      await supabase
        .from("cash_movements")
        .insert({
          id: crypto.randomUUID(),
          tenantId,
          userId,
          type: "income",
          category: "Paiement",
          amount: Number(amount),
          description: `Paiement — ${payment.students?.fullName || "Élève"} — ${paymentDateForMonth}`,
          paymentMethod: "cash",
          date: paymentDateStr,
          referenceId: payment.id,
          autoGenerated: true,
        })
        .maybeSingle();
    }

    if (Number(amount) > amountDue) {
      const excess = Number(amount) - amountDue;
      const { data: studentData } = await supabase
        .from("students")
        .select("advanceBalance")
        .eq("id", studentId)
        .single();
      const currentAdvance = Number((studentData as any)?.advanceBalance || 0);
      await supabase
        .from("students")
        .update({ advanceBalance: currentAdvance + excess })
        .eq("id", studentId);
    }

    await adjustSessionCredits({
      supabase,
      tenantId,
      studentId,
      groupId: groupId || null,
      sessionsIncluded: sessionsIncluded ?? 0,
      delta: 1,
    });

    return NextResponse.json(normalizePayment(payment), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
