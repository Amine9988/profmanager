"use server";

import { getTenantContext } from "@/lib/auth";

export type CalendarEvent = {
  id: string;
  title: string;
  date: Date;
  type: "session" | "payment_due" | "absence";
  groupName?: string;
  roomName?: string;
  studentName?: string;
  startTime?: string | null;
  href: string;
};

export async function getCalendarEvents(month: number, year: number) {
  const { tenantId, supabase } = await getTenantContext();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const formatLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const events: CalendarEvent[] = [];

  const [{ data: sessions }, { data: overduePayments }] = await Promise.all([
    supabase
      .from("sessions")
      .select("*, groups(name, roomId)")
      .eq("tenantId", tenantId)
      .gte("sessionDate", formatLocal(start))
      .lte("sessionDate", formatLocal(end))
      .order("sessionDate", { ascending: true }),
    supabase
      .from("payments")
      .select("*, students(id, fullName)")
      .eq("tenantId", tenantId)
      .gte("month", formatLocal(start))
      .lte("month", formatLocal(end)),
  ]);

  for (const s of sessions || []) {
    const g = (s.groups as any) ?? {};
    const timePart = s.startTime ? ` · ${s.startTime}${s.endTime ? `-${s.endTime}` : ""}` : "";
    events.push({
      id: `session-${s.id}`,
      title: `${g.name ?? "?"}${timePart}`,
      date: s.sessionDate,
      type: "session",
      groupName: g.name ?? "?",
      roomName: undefined,
      startTime: s.startTime ?? null,
      href: `/attendance/session/${s.id}`,
    });
  }

  for (const p of overduePayments || []) {
    if (Number(p.amountPaid) >= Number(p.amountDue)) continue;
    events.push({
      id: `payment-${p.id}`,
      title: `Paiement dû: ${(p.students as any).fullName}`,
      date: p.month,
      type: "payment_due",
      studentName: (p.students as any).fullName,
      href: `/students/${p.studentId}`,
    });
  }

  return events;
}
