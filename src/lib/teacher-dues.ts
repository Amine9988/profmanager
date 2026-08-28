/**
 * Single source of truth for teacher dues computation.
 *
 * Used by both the dues API route and the Excel export so the numbers can
 * never diverge again.
 *
 * Model (per-student salary type):
 *   - The teacher's percentages apply DIRECTLY to the group's session price
 *     for every taught lesson:
 *       earned(session) = (instClients × instPct% + teacherClients × teachPct%) × groupPrice
 *   - Adding more lessons therefore ALWAYS increases dues proportionally —
 *     no monthly re-splitting, no retroactive shrinking of earlier lines.
 *   - Client type is resolved per-enrollment (group_students.clientType),
 *     falling back to the student-level flag for legacy data.
 *
 * Monthly salary: earned = distinct taught months × salaryAmount.
 */

export interface DuesSessionRow {
  id: string;
  sessionDate: string;
  groupName: string | null;
  presentCount: number;
  institutionClients: number;
  teacherClients: number;
  earned: number;
  /** How much of this session's earnings is covered by recorded payments,
   *  allocated chronologically from the oldest taught session. */
  paidStatus: "paid" | "partial" | "unpaid";
}

export interface TeacherDuesResult {
  salaryType: string;
  rateInstitution: number;
  rateTeacher: number;
  perStudent: boolean;
  monthlyMonths: number;
  sessions: DuesSessionRow[];
  totals: { earned: number; paid: number; remaining: number; overpaid: number };
}

function monthKey(dateStr: string): string {
  return String(dateStr).slice(0, 7);
}

/** Session end timestamp; null when unparsable. */
function endMs(s: { sessionDate: string; startTime?: string | null; endTime?: string | null }): number | null {
  const time = s.endTime || s.startTime || "00:00";
  const base = String(s.sessionDate).slice(0, 10);
  const ms = new Date(`${base}T${time}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function computeTeacherDues(
  supabase: any,
  tenantId: string,
  teacherId: string,
  month: string | null
): Promise<TeacherDuesResult | null> {
  const { data: teacherRes } = await supabase
    .from("teachers")
    .select("*")
    .eq("tenantId", tenantId)
    .eq("id", teacherId)
    .single();
  const teacher = teacherRes as any;
  if (!teacher) return null;

  const salaryType = teacher.salaryType || "fixed";
  const rateInstitution = Number(teacher.salaryAmount) || 0;
  const rateTeacher = Number(teacher.salaryAmountTeacher) || 0;
  const perStudent = salaryType === "per_student";

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, pricePerSession")
    .eq("tenantId", tenantId)
    .eq("teacherId", teacherId);

  const groupNameById = new Map<string, string>((groups || []).map((g: any) => [g.id, g.name ?? ""]));
  const groupPriceById = new Map<string, number>((groups || []).map((g: any) => [String(g.id), Number(g.pricePerSession) || 0]));
  const groupIds = Array.from(groupNameById.keys());

  let sessions: any[] = [];
  if (groupIds.length > 0) {
    const { data: allSessions } = await supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime, status")
      .eq("tenantId", tenantId)
      .in("groupId", groupIds);

    const now = Date.now();
    const allIds = (allSessions || []).map((s: any) => s.id);

    // A session counts as TAUGHT once either:
    //   - its end time has passed, OR
    //   - the teacher already marked attendance on it (explicit proof the
    //     lesson happened — lets dues reflect reality immediately).
    let markedSessionIds = new Set<string>();
    if (allIds.length > 0) {
      const { data: markProbe } = await supabase
        .from("attendances")
        .select("sessionId")
        .eq("tenantId", tenantId)
        .in("sessionId", allIds);
      markedSessionIds = new Set((markProbe || []).map((m: any) => m.sessionId));
    }

    const taught = (allSessions || []).filter((s: any) => {
      if (s.status === "cancelled") return false;
      if (markedSessionIds.has(s.id)) return true;
      const ms = endMs(s);
      return ms !== null && ms < now;
    });

    sessions = month
      ? taught.filter((s: any) => monthKey(String(s.sessionDate)) === month)
      : taught;
    sessions.sort((a: any, b: any) => (String(a.sessionDate) < String(b.sessionDate) ? 1 : -1));
  }

  // ---- Attendance counting (plain queries + JS join; no embeds) ----------
  const presentBySession = new Map<string, number>();
  const instBySession = new Map<string, number>();
  const teachBySession = new Map<string, number>();
  const sessionGroupById = new Map<string, string>(sessions.map((s: any) => [s.id, s.groupId]));
  const sessionIds = sessions.map((s: any) => s.id);

  if (sessionIds.length > 0) {
    const [{ data: attendances }, { data: students }, { data: enrollments }] = await Promise.all([
      supabase.from("attendances").select("sessionId, studentId, status").eq("tenantId", tenantId).in("sessionId", sessionIds),
      supabase.from("students").select("id, clientType").eq("tenantId", tenantId),
      supabase.from("group_students").select("groupId, studentId, clientType").eq("tenantId", tenantId).in("groupId", groupIds),
    ]);

    const clientTypeByStudent = new Map<string, string>((students || []).map((st: any) => [st.id, st.clientType || "institution"]));
    const enrollmentType = new Map<string, string>();
    for (const gs of enrollments || []) {
      enrollmentType.set(`${gs.groupId}|${gs.studentId}`, gs.clientType || "institution");
    }

    // Dedupe defensively even though a unique index now guards the table.
    const seen = new Set<string>();
    for (const a of attendances || []) {
      if (a.status !== "present" && a.status !== "late") continue;
      const dedupeKey = `${a.sessionId}|${a.studentId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      presentBySession.set(a.sessionId, (presentBySession.get(a.sessionId) || 0) + 1);
      const gid = sessionGroupById.get(a.sessionId);
      const effective =
        (gid && enrollmentType.get(`${gid}|${a.studentId}`)) ||
        clientTypeByStudent.get(a.studentId) ||
        "institution";
      if (effective === "teacher") {
        teachBySession.set(a.sessionId, (teachBySession.get(a.sessionId) || 0) + 1);
      } else {
        instBySession.set(a.sessionId, (instBySession.get(a.sessionId) || 0) + 1);
      }
    }
  }

  // ---- Per-session rows ----------------------------------------------------
  // Percentage applies directly to the group's session price — every extra
  // lesson adds dues linearly; earlier lines never change retroactively.
  let earned = 0;
  const rows: DuesSessionRow[] = sessions.map((s: any) => {
    const instCount = instBySession.get(s.id) || 0;
    const teachCount = teachBySession.get(s.id) || 0;
    const presentCount = presentBySession.get(s.id) || 0;

    let amount = 0;
    if (perStudent) {
      const sessionPrice = groupPriceById.get(s.groupId) || 0;
      amount = ((instCount * rateInstitution + teachCount * rateTeacher) / 100) * sessionPrice;
    }
    earned += amount;

    return {
      id: s.id,
      sessionDate: String(s.sessionDate).slice(0, 10),
      groupName: groupNameById.get(s.groupId) || null,
      presentCount,
      institutionClients: instCount,
      teacherClients: teachCount,
      earned: amount,
      paidStatus: "unpaid" as const,
    };
  });

  let monthlyMonths = 0;
  if (!perStudent && rateInstitution > 0) {
    if (month) {
      monthlyMonths = month <= new Date().toISOString().slice(0, 7) ? 1 : 0;
    } else {
      monthlyMonths = new Set(rows.map((r) => r.sessionDate.slice(0, 7))).size;
    }
    earned = monthlyMonths * rateInstitution;
  }

  const { data: payments } = await supabase
    .from("teacher_payments")
    .select("amount, status, periodMonth")
    .eq("tenantId", tenantId)
    .eq("teacherId", teacherId);

  const paid = (payments || [])
    .filter((p: any) => p.status === "paid" && (!month || String(p.periodMonth).slice(0, 7) === month))
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // Allocate `paid` chronologically (oldest session first) to mark each
  // session as paid / partially paid / unpaid.
  let remainingPaidBudget = paid;
  const statusById = new Map<string, DuesSessionRow["paidStatus"]>();
  for (const row of [...rows].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))) {
    if (remainingPaidBudget >= row.earned && row.earned > 0) {
      statusById.set(row.id, "paid");
      remainingPaidBudget -= row.earned;
    } else if (remainingPaidBudget > 0) {
      statusById.set(row.id, "partial");
      remainingPaidBudget = 0;
    } else {
      statusById.set(row.id, "unpaid");
    }
    if (row.earned === 0) statusById.set(row.id, "paid"); // nothing due → treat as settled
  }
  for (const row of rows) {
    row.paidStatus = statusById.get(row.id) ?? "unpaid";
  }

  return {
    salaryType,
    rateInstitution,
    rateTeacher,
    perStudent,
    monthlyMonths,
    sessions: rows,
    totals: {
      earned,
      paid,
      remaining: Math.max(0, earned - paid),
      overpaid: Math.max(0, paid - earned),
    },
  };
}
