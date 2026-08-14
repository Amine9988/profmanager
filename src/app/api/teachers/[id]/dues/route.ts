import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { id } = await params;
    const month = req.nextUrl.searchParams.get("month") || null;

    const { data: teacherRes } = await supabase
      .from("teachers")
      .select("*")
      .eq("tenantId", tenantId)
      .eq("id", id)
      .single();

    const teacher = teacherRes as any;
    if (!teacher) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const salaryType = teacher.salaryType || "fixed";
    const rate = Number(teacher.salaryAmount) || 0;
    const perStudent = salaryType === "per_student";

    const { data: groups } = await supabase
      .from("groups")
      .select("id, name")
      .eq("tenantId", tenantId)
      .eq("teacherId", id);

    const groupNameById = new Map((groups || []).map((g: any) => [g.id, g.name]));
    const groupIds = Array.from(groupNameById.keys());

    let sessions: any[] = [];
    if (groupIds.length > 0) {
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id, groupId, sessionDate, startTime, endTime, status")
        .eq("tenantId", tenantId)
        .in("groupId", groupIds);

      const now = Date.now();
      const taught = (allSessions || []).filter((s: any) => {
        if (s.status === "cancelled") return false;
        const time = s.endTime || s.startTime || "00:00";
        const endMs = new Date(`${s.sessionDate}T${time}`).getTime();
        return !isNaN(endMs) && endMs < now;
      });

      sessions = month
        ? taught.filter((s: any) => String(s.sessionDate).slice(0, 7) === month)
        : taught;
      sessions.sort((a, b) => (String(a.sessionDate) < String(b.sessionDate) ? 1 : -1));
    }

    const sessionIds = sessions.map((s: any) => s.id);
    const presentBySession = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: attendances } = await supabase
        .from("attendances")
        .select("sessionId, status")
        .eq("tenantId", tenantId)
        .in("sessionId", sessionIds);
      for (const a of attendances || []) {
        if (a.status === "present" || a.status === "late") {
          presentBySession.set(a.sessionId, (presentBySession.get(a.sessionId) || 0) + 1);
        }
      }
    }

    let earned = 0;
    const rows = sessions.map((s: any) => {
      const presentCount = presentBySession.get(s.id) || 0;
      let amount = 0;
      if (perStudent) amount = presentCount * rate;
      earned += amount;
      return {
        id: s.id,
        sessionDate: String(s.sessionDate).slice(0, 10),
        groupName: groupNameById.get(s.groupId) || null,
        presentCount,
        earned: amount,
      };
    });

    let monthlyMonths = 0;
    if (!perStudent && rate > 0) {
      if (month) {
        monthlyMonths = month <= new Date().toISOString().slice(0, 7) ? 1 : 0;
      } else {
        monthlyMonths = new Set(rows.map((r) => r.sessionDate.slice(0, 7))).size;
      }
      earned = monthlyMonths * rate;
    }

    const { data: payments } = await supabase
      .from("teacher_payments")
      .select("amount, status, periodMonth")
      .eq("tenantId", tenantId)
      .eq("teacherId", id);

    const paid = (payments || [])
      .filter(
        (p: any) =>
          p.status === "paid" &&
          (!month || String(p.periodMonth).slice(0, 7) === month)
      )
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

    return NextResponse.json({
      teacher: {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        salaryType,
        salaryAmount: rate,
      },
      scope: month || "all",
      perStudent,
      rate,
      monthlyMonths,
      sessions: rows,
      totals: {
        earned,
        paid,
        remaining: earned - paid,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to compute dues" }, { status: 500 });
  }
}