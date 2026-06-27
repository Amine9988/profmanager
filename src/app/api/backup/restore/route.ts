import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTenantContext } from "@/lib/auth";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

function resolveMsg(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur && typeof cur === "object" && key in cur) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}

export async function POST(req: NextRequest) {
  try {
    const c = await cookies();
    const locale = (c.get("locale")?.value === "ar" || c.get("locale")?.value === "en") ? c.get("locale")!.value : "fr";
    const msgs = locale === "ar" ? (ar as Record<string, unknown>) : locale === "en" ? (en as Record<string, unknown>) : (fr as Record<string, unknown>);
    const t = (key: string) => resolveMsg(msgs, key);

    const ctx = await getTenantContext();
    const data = await req.json();

    if (!data.version || data.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: t("errors.invalid_data") }, { status: 400 });
    }

    const insertTable = async (table: string, rows: any[]) => {
      if (rows?.length > 0) {
        await ctx.supabase.from(table).delete().eq("tenantId", ctx.tenantId);
        await ctx.supabase.from(table).insert(rows);
      }
    };

    if (data.payments?.length > 0) {
      await insertTable("payments", data.payments.map((p: any) => ({
        id: p.id, tenantId: p.tenantId, studentId: p.studentId,
        month: p.month, amountDue: p.amountDue, amountPaid: p.amountPaid,
        status: p.status, paidAt: p.paidAt, note: p.note,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      })));
    }

    if (data.attendances?.length > 0) {
      await insertTable("attendances", data.attendances.map((a: any) => ({
        id: a.id, tenantId: a.tenantId, sessionId: a.sessionId, studentId: a.studentId,
        status: a.status, arrivedAt: a.arrivedAt, notes: a.notes,
        markedById: a.markedById, markedAt: a.markedAt,
      })));
    }

    if (data.sessions?.length > 0) {
      await insertTable("sessions", data.sessions.map((s: any) => ({
        id: s.id, tenantId: s.tenantId, groupId: s.groupId,
        scheduleSlotId: s.scheduleSlotId, sessionDate: s.sessionDate,
        startTime: s.startTime, endTime: s.endTime,
        status: s.status, cancellationReason: s.cancellationReason,
        topicCovered: s.topicCovered, createdAt: s.createdAt, updatedAt: s.updatedAt,
      })));
    }

    if (data.scheduleSlots?.length > 0) {
      await insertTable("schedule_slots", data.scheduleSlots.map((slot: any) => ({
        id: slot.id, tenantId: slot.tenantId, groupId: slot.groupId,
        dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime,
        location: slot.location, isOnline: slot.isOnline, createdAt: slot.createdAt,
      })));
    }

    if (data.groupStudents?.length > 0) {
      await ctx.supabase.from("group_students").delete().eq("tenantId", ctx.tenantId);
      await ctx.supabase.from("group_students").insert(data.groupStudents);
    }

    if (data.groups?.length > 0) {
      await insertTable("groups", data.groups.map((g: any) => ({
        id: g.id, tenantId: g.tenantId, subjectId: g.subjectId, teacherId: g.teacherId,
        name: g.name, level: g.level, maxCapacity: g.maxCapacity,
        pricePerSession: g.pricePerSession, priceType: g.priceType, status: g.status,
        createdAt: g.createdAt, updatedAt: g.updatedAt,
      })));
    }

    if (data.subjects?.length > 0) {
      await insertTable("subjects", data.subjects);
    }

    if (data.studentGuardians?.length > 0) {
      await ctx.supabase.from("student_guardians").delete().eq("tenantId", ctx.tenantId);
      await ctx.supabase.from("student_guardians").insert(data.studentGuardians);
    }

    if (data.guardians?.length > 0) {
      await insertTable("guardians", data.guardians);
    }

    if (data.levels?.length > 0) {
      await insertTable("levels", data.levels);
    }

    if (data.students?.length > 0) {
      await insertTable("students", data.students.map((s: any) => ({
        id: s.id, tenantId: s.tenantId, fullName: s.fullName,
        dateOfBirth: s.dateOfBirth || null, gradeLevel: s.gradeLevel,
        schoolName: s.schoolName, phone: s.phone, email: s.email,
        address: s.address, notes: s.notes, status: s.status,
        enrolledAt: s.enrolledAt, monthlyFee: s.monthlyFee ?? 0,
        subscriptionStart: s.subscriptionStart || null,
        createdById: s.createdById, createdAt: s.createdAt, updatedAt: s.updatedAt,
      })));
    }

    return NextResponse.json({ success: true });
  } catch {
    const c = await cookies();
    const locale = (c.get("locale")?.value === "ar" || c.get("locale")?.value === "en") ? c.get("locale")!.value : "fr";
    const msgs = locale === "ar" ? (ar as Record<string, unknown>) : locale === "en" ? (en as Record<string, unknown>) : (fr as Record<string, unknown>);
    const t = (key: string) => resolveMsg(msgs, key);
    return NextResponse.json({ error: t("errors.restore_error") }, { status: 500 });
  }
}
