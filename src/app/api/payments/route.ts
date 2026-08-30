import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { calculateStatus, normalizePayment, adjustSessionCredits } from "@/lib/payments/utils";
import { getOverdueSubscriptionsData } from "@/lib/payments/overdue";
import { emailInvoiceForCreatedPayment } from "@/lib/invoice-email";

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

    if (aggregate === "counts") {
      const { paymentStatusCounts } = await import("@/lib/db/aggregates");
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const counts = await paymentStatusCounts(tenantId, firstOfMonth);
      return NextResponse.json(counts);
    }

    const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const search = searchParams.get("search") || "";
    const hasPagination = pageParam !== null || limitParam !== null;
    const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
    // Default: monthly view 200, allTime 100, explicit limit capped at 500
    const defaultLimit = allTime ? 100 : 200;
    const limit = Math.min(500, Math.max(1, parseInt(limitParam || String(defaultLimit), 10) || defaultLimit));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("payments")
      .select("*, students(id, fullName, monthlyFee)")
      .eq("tenantId", tenantId)
      .order("month", { ascending: false })
      .order("createdAt", { ascending: false });

    if (!allTime) query = query.eq("month", firstOfMonth);

    // Apply server pagination to avoid 10k payload blowup
    if (hasPagination || allTime) {
      query = (query as any).range(offset, offset + limit - 1);
    } else if (!hasPagination && !allTime) {
      // Monthly view without explicit pagination — cap at 500
      query = (query as any).limit(500);
    }

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
        groupId: p.groupId ?? norm.groupId ?? null,
        groupName: "",
        student: {
          id: p.students?.id,
          fullName: p.students?.fullName,
          monthlyFee: p.students?.monthlyFee,
          groupStudents: [],
        },
        students: undefined,
        status: computedStatus,
      };
    });

    const groupIds = [...new Set(merged.map((p: any) => p.groupId).filter(Boolean))];
    if (groupIds.length > 0) {
      const { data: groupRows } = await supabase.from("groups").select("id, name").in("id", groupIds);
      const nameById = new Map<string, string>((groupRows || []).map((g: any) => [String(g.id), String(g.name || "")]));
      for (const p of merged) {
        p.groupName = p.groupId ? nameById.get(p.groupId) || "" : "";
      }
    }

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
    const { studentId, month, amount, note, paymentDate, groupId, discountPercent } = body;
    const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));

    if (!studentId || !month || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const paymentDateStr = paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
      ? paymentDate
      : new Date().toISOString().split("T")[0];
    const now = new Date();
    const timePart = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const paymentDateTime = new Date(`${paymentDateStr}T${timePart}`);
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
      const groupPrice = Number(group?.pricePerSession);
      if (Number.isFinite(groupPrice) && groupPrice > 0) amountDue = groupPrice;
      sessionsIncluded = group?.sessionsIncluded ? Number(group.sessionsIncluded) : null;

      // Percentage discount applies to THIS payment's due only.
      if (pct > 0) amountDue = Math.round(amountDue * (1 - pct / 100));
    } else {
      const { data: student } = await supabase
        .from("students")
        .select("monthlyFee")
        .eq("id", studentId)
        .eq("tenantId", tenantId)
        .maybeSingle();
      const fee = Number(student?.monthlyFee);
      if (Number.isFinite(fee) && fee > 0) amountDue = fee;
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
      discountPercent: pct,
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

    const invoiceEmail = Number(amount) > 0
      ? await emailInvoiceForCreatedPayment(supabase, tenantId, payment)
      : { sent: false as const, reason: "no_parent_email" as const };

    return NextResponse.json({ ...normalizePayment(payment), invoiceEmail }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
