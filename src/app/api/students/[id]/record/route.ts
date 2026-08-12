import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, tenantId } = await getTenantContext();

    const { data: student } = await supabase
      .from("students")
      .select("*, group_students(*, groups(*, subjects(*))), attendances(*, sessions(*)), payments(*)")
      .eq("id", id)
      .eq("tenantId", tenantId)
      .single();

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const groupStudents = ((student.group_students as any[]) || [])
      .filter((gs: any) => gs.status === "active")
      .map((gs: any) => ({
        id: gs.id,
        status: gs.status,
        group: gs.groups ? { id: gs.groups.id, name: gs.groups.name, pricePerSession: Number(gs.groups.pricePerSession || 0) } : null,
        subject: gs.groups?.subjects ? { id: gs.groups.subjects.id, name: gs.groups.subjects.name, color: gs.groups.subjects.color || null } : null,
      }));

    const payments = (Array.isArray(student.payments) ? student.payments : student.payments ? [student.payments] : [])
      .map((p: any) => ({
        id: p.id,
        month: p.month,
        amountDue: Number(p.amountDue),
        amountPaid: Number(p.amountPaid),
        status: p.status,
        paidAt: p.paidAt,
        receiptNumber: p.receiptNumber,
        note: p.note,
      }))
      .sort((a: any, b: any) => new Date(b.month).getTime() - new Date(a.month).getTime());

    const attendances = (Array.isArray(student.attendances) ? student.attendances : student.attendances ? [student.attendances] : [])
      .map((a: any) => ({
        id: a.id,
        status: a.status,
        markedAt: a.markedAt,
        sessionDate: a.sessions?.sessionDate || null,
        startTime: a.sessions?.startTime || null,
        endTime: a.sessions?.endTime || null,
      }))
      .sort((a: any, b: any) => new Date(a.sessionDate || a.markedAt).getTime() - new Date(b.sessionDate || b.markedAt).getTime());

    const presentCount = attendances.filter((a: any) => a.status === "present" || a.status === "late").length;
    const absentCount = attendances.filter((a: any) => a.status === "absent").length;
    const excusedCount = attendances.filter((a: any) => a.status === "excused").length;

    const totalDue = payments.reduce((sum: number, p: any) => sum + p.amountDue, 0);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, schoolPhone, schoolLogo")
      .eq("id", tenantId)
      .single();

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
        attendanceRate: attendances.length > 0 ? Math.round((presentCount / attendances.length) * 100) : 0,
        totalSessions: attendances.length,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}