import { getTenantContext } from "@/lib/auth";
import { NextResponse } from "next/server";
import { generateSessionDates } from "@/lib/generate-sessions";

export const dynamic = "force-dynamic";

export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase: admin, tenantId } = ctx;

  const { data: settings } = await admin
    .from("settings")
    .select("schoolYearStart, schoolYearEnd")
    .eq("tenantId", tenantId)
    .maybeSingle();

  if (!settings?.schoolYearStart || !settings?.schoolYearEnd) {
    return NextResponse.json({ error: "School year dates not set in settings" }, { status: 400 });
  }

  const startDate = new Date(settings.schoolYearStart);
  const endDate = new Date(settings.schoolYearEnd);

  const { data: groups } = await admin
    .from("groups")
    .select("id, name, schedule_slots(*)")
    .eq("tenantId", tenantId);

  let totalGenerated = 0;
  const results: unknown[] = [];

  for (const group of groups ?? []) {
    const slots = (group as any).schedule_slots ?? [];

    if (slots.length === 0) {
      results.push({ group: (group as any).name, sessions: 0, reason: "no slots" });
      continue;
    }

    const dates = generateSessionDates(slots, startDate, endDate);

    if (dates.length === 0) {
      results.push({ group: (group as any).name, sessions: 0, reason: "no matching days" });
      continue;
    }

    await admin
      .from("sessions")
      .delete()
      .eq("groupId", group.id)
      .eq("status", "scheduled");

    const sessionObjects = dates.map((s) => ({
      id: crypto.randomUUID(),
      tenantId,
      groupId: group.id,
      sessionDate: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: "scheduled",
      type: "regular",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const BATCH_SIZE = 500;
    let batchErrors = 0;

    for (let i = 0; i < sessionObjects.length; i += BATCH_SIZE) {
      const batch = sessionObjects.slice(i, i + BATCH_SIZE);
      const { error } = await admin.from("sessions").insert(batch);

      if (error) {
        batchErrors++;
      }
    }

    totalGenerated += sessionObjects.length;
    results.push({
      group: (group as any).name,
      sessions: sessionObjects.length,
      batches: Math.ceil(sessionObjects.length / BATCH_SIZE),
      errors: batchErrors,
    });
  }

  return NextResponse.json({
    success: true,
    total: totalGenerated,
    schoolYear: {
      start: settings.schoolYearStart,
      end: settings.schoolYearEnd,
    },
    results,
  });
}
