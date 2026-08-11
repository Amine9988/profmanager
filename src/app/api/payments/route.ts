import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { calculateStatus, normalizePayment } from "@/lib/payments/utils";
import { getOverdueSubscriptionsData } from "@/lib/payments/overdue";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const studentId = searchParams.get("studentId");
    const statusFilter = searchParams.get("status");
    const aggregate = searchParams.get("aggregate");

    if (aggregate === "overdue") {
      const data = await getOverdueSubscriptionsData();
      return NextResponse.json(data);
    }

    const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;

    const { data: payments } = await supabase
      .from("payments")
      .select("*, students(id, fullName, monthlyFee, group_students(*, groups(name)))")
      .eq("tenantId", tenantId)
      .eq("month", firstOfMonth);

    const merged = (payments || []).map((p: any) => {
      const norm = normalizePayment(p as Record<string, unknown>) as any;
      const computedStatus = calculateStatus(Number(norm.amountDue), Number(norm.amountPaid), new Date(firstOfMonth));
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
    if (groupId) {
      const { data: group } = await supabase
        .from("groups")
        .select("pricePerSession")
        .eq("id", groupId)
        .eq("tenantId", tenantId)
        .maybeSingle();
      if (group?.pricePerSession) amountDue = Number(group.pricePerSession);
    } else {
      const { data: student } = await supabase
        .from("students")
        .select("monthlyFee")
        .eq("id", studentId)
        .eq("tenantId", tenantId)
        .maybeSingle();
      if (student?.monthlyFee) amountDue = Number(student.monthlyFee);
    }

    const { data: existing } = await supabase
      .from("payments")
      .select("*")
      .eq("tenantId", tenantId)
      .eq("studentId", studentId)
      .eq("month", paymentDateForMonth)
      .maybeSingle();

    const alreadyPaid = existing ? Number(existing.amountPaid) : 0;
    const remainingDue = amountDue - alreadyPaid;
    if (amountDue > 0 && Number(amount) > remainingDue) {
      return NextResponse.json(
        { error: "Le montant dépasse le montant restant dû" },
        { status: 400 }
      );
    }

    if (existing) {
      const newPaid = Number(existing.amountPaid) + Number(amount);
      const newStatus = calculateStatus(amountDue, newPaid, new Date(paymentDateForMonth));
      const paidAt = newStatus === "paid" ? paymentDateTime.toISOString() : existing.paidAt;

      const updateFields: Record<string, unknown> = {
        amountPaid: newPaid,
        status: newStatus,
        paidAt: paidAt,
        updatedAt: new Date().toISOString(),
      };
      if (amountDue !== Number(existing.amountDue)) updateFields.amountDue = amountDue;
      if (note !== undefined) updateFields.note = note;

      // receiptNumber / receiptSequence columns removed from schema — skip

      const { data: updated, error: updateError } = await supabase
        .from("payments")
        .update(updateFields)
        .eq("id", existing.id)
        .select("*, students(id, fullName, monthlyFee, group_students(*, groups(name)))")
        .single();

      if (updateError || !updated) {
        return NextResponse.json(
          { error: updateError?.message || "Failed to update payment" },
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
            description: `Paiement supplémentaire — ${existing.students?.fullName || "Élève"} — ${paymentDateForMonth}`,
            paymentMethod: "cash",
            date: paymentDateStr,
            referenceId: existing.id,
            autoGenerated: true,
          })
          .maybeSingle();
      }

      if (newPaid > amountDue) {
        const excess = newPaid - amountDue;
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

      return NextResponse.json(normalizePayment(updated));
    }

    const status = calculateStatus(amountDue, Number(amount), new Date(paymentDateForMonth));
    const paidAt = status === "paid" ? paymentDateTime.toISOString() : null;

    const insertFields: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenantId: tenantId,
      studentId: studentId,
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

    return NextResponse.json(normalizePayment(payment), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
