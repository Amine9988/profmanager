import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { consumeExpiredSessionCredits, scheduleAttendanceMaintenance } from "@/server/actions/attendance";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, tenantId } = await getTenantContext();

    await consumeExpiredSessionCredits();
    void scheduleAttendanceMaintenance();

    const { data: student } = await supabase
      .from("students")
      .select("*, group_students(*, groups(*, subjects(*)))")
      .eq("id", id)
      .eq("tenantId", tenantId)
      .single();

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const [{ data: attendancesData }, { data: paymentsData }, { data: tenant }, { data: roomsData }] = await Promise.all([
      supabase
        .from("attendances")
        .select("*, sessions(*)")
        .eq("studentId", id)
        .eq("tenantId", tenantId)
        .order("markedAt", { ascending: false })
        .limit(60),
      supabase
        .from("payments")
        .select("*")
        .eq("studentId", id)
        .eq("tenantId", tenantId)
        .order("month", { ascending: false })
        .limit(36),
      supabase.from("tenants").select("name, schoolPhone, schoolLogo").eq("id", tenantId).single(),
      supabase.from("rooms").select("id, name").eq("tenantId", tenantId),
    ]);
    const roomById = Object.fromEntries((roomsData || []).map((r: any) => [r.id, r.name]));

    const rawAttendances = attendancesData || [];
    const paymentsRaw = paymentsData || [];

    const sessionIds = [...new Set(rawAttendances.map((a: any) => a.sessionId).filter(Boolean))];
    const { data: sessionGroups } = await supabase
      .from("sessions")
      .select("id, groups(id, name, color)")
      .in("id", sessionIds.length > 0 ? sessionIds : [""]);
    const sessionGroupMap = new Map<string, string>(
      (sessionGroups || []).map((sg: any) => [sg.id, sg.groups?.name || null])
    );
    const sessionGroupColorMap = new Map<string, string | null>(
      (sessionGroups || []).map((sg: any) => [sg.id, sg.groups?.color || null])
    );

    const groupStudents = ((student.group_students as any[]) || [])
      .filter((gs: any) => gs.status === "active")
      .map((gs: any) => {
        const sessionsIncluded = gs.groups?.sessionsIncluded != null ? Number(gs.groups.sessionsIncluded) : null;
        const paidCount = paymentsRaw.filter((p: any) => p.groupId === gs.groupId && Number(p.amountPaid) > 0).length;
        return {
          id: gs.id,
          status: gs.status,
          sessionsIncluded,
          remainingSessions: gs.remainingSessions != null ? Number(gs.remainingSessions) : null,
          consumedSessions: gs.consumedSessions != null ? Number(gs.consumedSessions) : 0,
          paidSessions: sessionsIncluded != null ? paidCount * sessionsIncluded : 0,
          group: gs.groups
            ? {
                id: gs.groups.id,
                name: gs.groups.name,
                pricePerSession: Number(gs.groups.pricePerSession || 0),
                color: gs.groups.color || null,
                roomName: gs.groups.roomId ? roomById[gs.groups.roomId] || null : null,
              }
            : null,
          subject: gs.groups?.subjects
            ? { id: gs.groups.subjects.id, name: gs.groups.subjects.name, color: gs.groups.subjects.color || null }
            : null,
        };
      });

    const groupIdToName = new Map<string, string>(
      groupStudents.filter((gs: any) => gs.group?.id).map((gs: any) => [gs.group.id, gs.group.name])
    );

    const payments = paymentsRaw
      .map((p: any) => ({
        id: p.id,
        month: p.month,
        groupId: p.groupId ?? null,
        groupName: p.groupId ? groupIdToName.get(p.groupId) || null : null,
        amountDue: Number(p.amountDue),
        amountPaid: Number(p.amountPaid),
        status: p.status,
        paidAt: p.paidAt || p.createdAt,
        receiptNumber: p.receiptNumber,
        note: p.note,
      }))
      .sort((a: any, b: any) => new Date(b.month).getTime() - new Date(a.month).getTime());

    const paidPayments = payments.filter((p: any) => p.status === "paid");
    const paidGroupMonths = new Set(
      paidPayments.filter((p: any) => p.groupId).map((p: any) => `${p.groupId}:${p.month.slice(0, 7)}`)
    );
    const paidMonthsAnyGroup = new Set(
      paidPayments.filter((p: any) => !p.groupId).map((p: any) => p.month.slice(0, 7))
    );

    const attendances = rawAttendances
      .map((a: any) => {
        const sessionDate = a.sessions?.sessionDate || null;
        const sessionGroupId = a.sessions?.groupId || null;
        const monthKey = sessionDate ? String(sessionDate).slice(0, 7) : null;
        const paid = Boolean(
          (sessionGroupId && monthKey && paidGroupMonths.has(`${sessionGroupId}:${monthKey}`)) ||
            (monthKey && paidMonthsAnyGroup.has(monthKey))
        );
        return {
          id: a.id,
          status: a.status,
          sessionStatus: a.sessions?.status || null,
          markedAt: a.markedAt,
          sessionDate,
          startTime: a.sessions?.startTime || null,
          endTime: a.sessions?.endTime || null,
          groupName: sessionGroupMap.get(a.sessionId) || null,
          groupColor: sessionGroupColorMap.get(a.sessionId) || null,
          paid,
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.sessionDate || a.markedAt).getTime() - new Date(b.sessionDate || b.markedAt).getTime()
      );

    const activeAttendances = attendances.filter((a: any) => a.sessionStatus !== "cancelled");
    const presentCount = activeAttendances.filter((a: any) => a.status === "present" || a.status === "late").length;
    const absentCount = activeAttendances.filter((a: any) => a.status === "absent").length;
    const excusedCount = activeAttendances.filter((a: any) => a.status === "excused").length;

    const groupsDue = groupStudents.reduce((sum: number, gs: any) => sum + (gs.group?.pricePerSession || 0), 0);
    const paymentsDue = payments.reduce((sum: number, p: any) => sum + p.amountDue, 0);
    const totalDue = Math.max(groupsDue, paymentsDue);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

    return Response.json({
      student: {
        id: student.id,
        fullName: student.fullName,
        gradeLevel: student.gradeLevel,
        schoolName: student.schoolName,
        phone: student.phone,
        fatherPhone: student.fatherPhone,
        email: student.email,
        address: student.address,
        notes: student.notes,
        monthlyFee: Number(student.monthlyFee || 0),
        subscriptionStart: student.subscriptionStart,
        status: student.status,
        advanceBalance: Number(student.advanceBalance || 0),
        createdAt: student.createdAt,
      },
      tenant: {
        name: tenant?.name || null,
        schoolPhone: tenant?.schoolPhone || null,
        schoolLogo: tenant?.schoolLogo || null,
      },
      groupStudents,
      payments,
      attendances,
      stats: {
        totalDue,
        totalPaid,
        totalRemaining: Math.max(totalDue - totalPaid, 0),
        presentCount,
        absentCount,
        excusedCount,
        attendanceRate: activeAttendances.length > 0 ? Math.round((presentCount / activeAttendances.length) * 100) : 0,
        totalSessions: activeAttendances.length,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
