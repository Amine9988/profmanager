"use server";

import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { studentSchema } from "@/lib/validations/student";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { randomUUID } from "crypto";
import { sessionEndTimestamp } from "@/lib/session-time";

export type ActionResult = { error?: string; success?: boolean; id?: string };

export async function getStudents() {
  const { tenantId, supabase } = await getTenantContext();

  const { data: students, error } = await supabase
    .from("students")
    .select("*, group_students(*, groups(*))")
    .eq("tenantId", tenantId)
    .order("fullName", { ascending: true });

  if (error) {
    console.error("[getStudents] Query error:", error.message, "SQL:", error.details);
    return [];
  }

  return (students || []).map((s: any) => ({
    ...s,
    groupStudents: ((s.groupStudents || s.group_students || []) as any[]).filter((gs: any) => gs.status === "active").map((gs: any) => ({
      ...gs,
      group: gs.groups ? { ...gs.groups, pricePerSession: Number(gs.groups.pricePerSession) } : null,
    })),
  })) as any;
}

export async function getStudent(studentId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: student } = await supabase
    .from("students")
    .select("*, group_students(*, groups(*, subjects(*))), attendances(*, sessions(*)), payments(*)")
    .eq("id", studentId)
    .eq("tenantId", tenantId)
    .single();

  if (!student) return null;

  const rawAttendances = Array.isArray(student.attendances) ? student.attendances : student.attendances ? [student.attendances] : [];

  // Resolve group names per session. The local shim can't join the same table
  // twice in one query, so fetch them separately.
  const sessionIds = [...new Set(rawAttendances.map((a: any) => a.sessionId).filter(Boolean))];
  const { data: sessionGroups } = await supabase
    .from("sessions")
    .select("id, groups(id, name)")
    .in("id", sessionIds.length > 0 ? sessionIds : [""]);
  const sessionGroupMap = new Map<string, string>(
    (sessionGroups || []).map((sg: any) => [sg.id, sg.groups?.name || null])
  );

  const groupStudents2 = ((student.group_students as any[]) || [])
    .filter((gs: any) => gs.status === "active")
    .map((gs: any) => ({ groupId: gs.groupId, groupName: gs.groups?.name || null, enrolledAt: gs.enrolledAt || null }));
  const groupNameMap = new Map<string, string>(
    groupStudents2.filter((g: any) => g.groupId && g.groupName).map((g: any) => [g.groupId, g.groupName])
  );
  const enrolledAtByGroup = new Map<string, number>();
  for (const g of groupStudents2) {
    if (g.groupId && g.enrolledAt) {
      const ts = new Date(g.enrolledAt).getTime();
      if (!Number.isNaN(ts)) enrolledAtByGroup.set(g.groupId, ts);
    }
  }

  // Hide any attendance for a session that ended before the student enrolled
  // in that group (e.g. enrolled on 14 Aug, an 8 Aug session must not appear).
  const visibleAttendances = rawAttendances.filter((a: any) => {
    const groupId = a.sessions?.groupId ?? null;
    if (!groupId) return true;
    const enrolledMs = enrolledAtByGroup.get(groupId);
    if (enrolledMs === undefined) return true;
    const endMs = sessionEndTimestamp(a.sessions);
    if (endMs === null) return true;
    return endMs >= enrolledMs;
  });

  return {
    ...student,
    monthlyFee: Number(student.monthlyFee),
    groupStudents: ((student.group_students as any[]) || []).filter((gs: any) => gs.status === "active").map((gs: any) => {
      const sessionsIncluded = gs.groups?.sessionsIncluded != null ? Number(gs.groups.sessionsIncluded) : null;
      const paidCount = (student.payments || []).filter((p: any) => p.groupId === gs.groupId && Number(p.amountPaid) > 0).length;
      return {
        ...gs,
        consumedSessions: gs.consumedSessions != null ? Number(gs.consumedSessions) : 0,
        paidSessions: sessionsIncluded != null ? paidCount * sessionsIncluded : 0,
        group: gs.groups ? { ...gs.groups, pricePerSession: Number(gs.groups.pricePerSession) } : null,
      };
    }),
    attendances: visibleAttendances.sort((a: any, b: any) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime()).slice(0, 20).map((a: any) => ({
      ...a,
      session: { ...a.sessions, groupName: sessionGroupMap.get(a.sessionId) || null },
    })),
    guardians: (student.guardians as any[]) || [],
    payments: (Array.isArray(student.payments) ? student.payments : student.payments ? [student.payments] : []).map((p: any) => ({
      ...p,
      groupId: p.groupId ?? null,
      groupName: p.groupId ? groupNameMap.get(p.groupId) || null : null,
      amountDue: Number(p.amountDue),
      amountPaid: Number(p.amountPaid),
    })),
  };
}

export async function createStudent(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.create");

    const parsed = studentSchema.safeParse({
      fullName: formData.get("fullName"),
      dateOfBirth: formData.get("dateOfBirth") || null,
      gradeLevel: formData.get("gradeLevel") || null,
      schoolName: formData.get("schoolName") || null,
      phone: formData.get("phone") || null,
      fatherPhone: formData.get("fatherPhone") || null,
      email: formData.get("email") || null,
      address: formData.get("address") || null,
      notes: formData.get("notes") || null,
      monthlyFee: formData.get("monthlyFee"),
      subscriptionStart: formData.get("subscriptionStart"),
      billingType: formData.get("billingType") || "monthly",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    const now = new Date().toISOString();
    const { data: student } = await ctx.supabase.from("students").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      fullName: parsed.data.fullName,
      dateOfBirth: parsed.data.dateOfBirth || null,
      gradeLevel: parsed.data.gradeLevel,
      schoolName: parsed.data.schoolName,
      phone: parsed.data.phone,
      fatherPhone: parsed.data.fatherPhone,
      email: parsed.data.email || null,
      address: parsed.data.address,
      notes: parsed.data.notes,
      monthlyFee: parsed.data.monthlyFee,
      subscriptionStart: parsed.data.subscriptionStart || null,
      billingType: parsed.data.billingType,
      status: "active",
      enrolledAt: now,
      createdById: ctx.userId,
      createdAt: now,
      updatedAt: now,
    }).select().single();

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "student.created", entityType: "student", entityId: student!.id,
      metadata: { fullName: student!.fullName },
    });

    revalidateFullApp();
    return { success: true, id: student!.id };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function updateStudent(studentId: string, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.update");

    const parsed = studentSchema.safeParse({
      fullName: formData.get("fullName"),
      dateOfBirth: formData.get("dateOfBirth") || null,
      gradeLevel: formData.get("gradeLevel") || null,
      schoolName: formData.get("schoolName") || null,
      phone: formData.get("phone") || null,
      fatherPhone: formData.get("fatherPhone") || null,
      email: formData.get("email") || null,
      address: formData.get("address") || null,
      notes: formData.get("notes") || null,
      monthlyFee: formData.get("monthlyFee"),
      subscriptionStart: formData.get("subscriptionStart"),
      billingType: formData.get("billingType") || "monthly",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    const { data: result } = await ctx.supabase.from("students").update({
      fullName: parsed.data.fullName,
      dateOfBirth: parsed.data.dateOfBirth || null,
      gradeLevel: parsed.data.gradeLevel,
      schoolName: parsed.data.schoolName,
      phone: parsed.data.phone,
      fatherPhone: parsed.data.fatherPhone,
      email: parsed.data.email || null,
      address: parsed.data.address,
      notes: parsed.data.notes,
      monthlyFee: parsed.data.monthlyFee,
      subscriptionStart: parsed.data.subscriptionStart || null,
      billingType: parsed.data.billingType,
    }).eq("id", studentId).eq("tenantId", ctx.tenantId).select();

    if (!result || result.length === 0) {
      return { error: t("errors.student_not_found") };
    }

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "student.updated", entityType: "student", entityId: studentId,
    });

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function restoreStudent(studentId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.delete");
    const { data } = await ctx.supabase.from("students").update({ status: "active" }).eq("id", studentId).eq("tenantId", ctx.tenantId).select();
    if (!data || data.length === 0) return { error: t("errors.student_not_found") };

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function archiveStudent(studentId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.delete");
    const { data } = await ctx.supabase.from("students").update({ status: "archived" }).eq("id", studentId).eq("tenantId", ctx.tenantId).select();
    if (!data || data.length === 0) return { error: t("errors.student_not_found") };

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function getStudentBalance(studentId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: payments } = await supabase
    .from("payments")
    .select("amountDue, amountPaid")
    .eq("studentId", studentId)
    .eq("tenantId", tenantId);

  const { data: student } = await supabase
    .from("students")
    .select("advanceBalance")
    .eq("id", studentId)
    .eq("tenantId", tenantId)
    .single();

  const totalDue = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amountDue), 0);
  const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0);

  return {
    totalDue,
    totalPaid,
    balance: totalDue - totalPaid,
    advanceBalance: Number((student as any)?.advanceBalance || 0),
  };
}

export async function bulkImportStudents(students: { fullName: string; gradeLevel?: string; schoolName?: string; phone?: string; email?: string }[]) {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.create");

    const now = new Date().toISOString();
    const rows = students.map((s) => ({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      fullName: s.fullName,
      gradeLevel: s.gradeLevel || null,
      schoolName: s.schoolName || null,
      phone: s.phone || null,
      email: s.email || null,
      status: "active",
      enrolledAt: now,
      createdById: ctx.userId,
      createdAt: now,
      updatedAt: now,
    }));

    const { data, error } = await ctx.supabase.from("students").insert(rows).select();

    if (error) return { imported: 0, skipped: students.length, errors: [error.message] };

    revalidateFullApp();
    return { imported: data?.length ?? 0, skipped: students.length - (data?.length ?? 0), errors: [] };
  } catch {
    return { imported: 0, skipped: students.length, errors: [t("common.error")] };
  }
}

export async function deleteStudent(studentId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("students.delete");

    const { data: student } = await ctx.supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("tenantId", ctx.tenantId)
      .single();
    if (!student) return { error: t("errors.student_not_found") };

    // Clean up cash movements linked to this student's payments before deleting them
    const { data: studentPayments } = await ctx.supabase
      .from("payments")
      .select("id")
      .eq("studentId", studentId)
      .eq("tenantId", ctx.tenantId);
    if (studentPayments && studentPayments.length > 0) {
      const paymentIds = studentPayments.map((p) => p.id);
      await ctx.supabase.from("cash_movements").delete().in("referenceId", paymentIds).eq("autoGenerated", true);
    }

    await ctx.supabase.from("payments").delete().eq("studentId", studentId).eq("tenantId", ctx.tenantId);
    await ctx.supabase.from("attendances").delete().eq("studentId", studentId).eq("tenantId", ctx.tenantId);
    await ctx.supabase.from("group_students").delete().eq("studentId", studentId).eq("tenantId", ctx.tenantId);

    const { error } = await ctx.supabase
      .from("students")
      .delete()
      .eq("id", studentId)
      .eq("tenantId", ctx.tenantId);

    if (error) throw error;

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "student.deleted", entityType: "student", entityId: studentId,
    });

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}
