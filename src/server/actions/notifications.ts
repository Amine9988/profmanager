"use server";

import { randomUUID } from "crypto";
import { getTenantContext } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { isPaymentOverdue } from "@/lib/payments/overdue";

export async function getNotifications() {
  const { tenantId, supabase } = await getTenantContext();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("tenantId", tenantId)
    .order("createdAt", { ascending: false })
    .limit(20);

  return data || [];
}

export async function markAllNotificationsRead() {
  const { tenantId, supabase } = await getTenantContext();

  await supabase.from("notifications").update({ isRead: true }).eq("tenantId", tenantId).eq("isRead", false);

  revalidateFullApp();
  return { success: true };
}

export async function getUnreadNotificationCount() {
  const { tenantId, supabase } = await getTenantContext();

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("tenantId", tenantId)
    .eq("isRead", false);

  return count ?? 0;
}

export async function checkAbsenceAlerts() {
  const t = await getT();
  const { tenantId, supabase } = await getTenantContext();

  const { data: students } = await supabase.from("students").select("id, fullName").eq("tenantId", tenantId).eq("status", "active");

  for (const student of students || []) {
    const { data: lastThree } = await supabase
      .from("attendances")
      .select("status, sessions(sessionDate)")
      .eq("studentId", student.id)
      .eq("tenantId", tenantId)
      .order("sessions.sessionDate", { ascending: false })
      .limit(3);

    if (!lastThree || lastThree.length < 3) continue;
    if (lastThree.every((a) => a.status === "absent")) {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("tenantId", tenantId)
        .eq("type", "consecutive_absences")
        .gte("createdAt", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (!existing) {
        await supabase.from("notifications").insert({
          id: randomUUID(),
          tenantId: tenantId,
          type: "consecutive_absences",
          title: t("notifications.repeated_absences_title"),
          message: t("notifications.repeated_absences_msg", { student: student.fullName }),
        });
      }
    }
  }
}

export async function checkOverduePayments() {
  const t = await getT();
  const { tenantId, supabase } = await getTenantContext();

  const now = new Date();
  const firstOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: allPayments } = await supabase
    .from("payments")
    .select("studentId, amountDue, amountPaid, month, students(fullName)")
    .eq("tenantId", tenantId)
    .lte("month", firstOfCurrentMonth);

  const seen = new Set<string>();
  for (const p of allPayments || []) {
    if (!isPaymentOverdue(Number(p.amountDue), Number(p.amountPaid), p.month)) continue;
    if (seen.has(p.studentId)) continue;
    seen.add(p.studentId);

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenantId", tenantId)
      .eq("type", "payment_overdue")
      .gte("createdAt", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!existing) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        tenantId: tenantId,
        type: "payment_overdue",
        title: t("notifications.overdue_payment_title"),
        message: t("notifications.overdue_payment_msg", {
          student: (p.students as any).fullName,
          date: new Intl.DateTimeFormat("en-US").format(new Date(p.month)),
        }),
      });
    }
  }
}
