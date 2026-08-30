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

import { formatLocalYmd } from "@/lib/session-dates";
import { sessionDateUpperBound } from "@/lib/session-time";

export interface DuesSessionRow {
  id: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  createdAt: string | null;
  groupName: string | null;
  presentCount: number;
  institutionClients: number;
  teacherClients: number;
  earned: number;
  /** How much of this session's earnings is covered by recorded payments,
   *  allocated chronologically from the oldest taught session. */
  paidStatus: "paid" | "unpaid";
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

function parseCoveredSessions(raw: unknown): DuesSessionRow[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s: any) => ({
        id: String(s.id || ""),
        sessionDate: String(s.sessionDate || "").slice(0, 10),
        startTime: s.startTime ? String(s.startTime).slice(0, 5) : null,
        endTime: s.endTime ? String(s.endTime).slice(0, 5) : null,
        createdAt: s.createdAt ? String(s.createdAt) : null,
        groupName: s.groupName ?? null,
        presentCount: Number(s.presentCount) || 0,
        institutionClients: Number(s.institutionClients) || 0,
        teacherClients: Number(s.teacherClients) || 0,
        earned: Number(s.earned) || 0,
        paidStatus: "paid" as const,
      }))
      .filter((s) => s.id && s.earned > 0);
  } catch {
    return [];
  }
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = String(hhmm).split(":").map(Number);
  const t = (h || 0) * 60 + (m || 0) + mins;
  const norm = ((t % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}

function durationMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  const [h0, m0] = start.split(":").map(Number);
  const [h1, m1] = end.split(":").map(Number);
  return Math.max(1, (h1 || 0) * 60 + (m1 || 0) - ((h0 || 0) * 60 + (m0 || 0)));
}

function inferClients(earned: number, rateI: number, rateT: number, price: number) {
  if (price <= 0) return { inst: 0, teach: 0, present: 0 };
  const pairUnit = ((rateI + rateT) / 100) * price;
  if (pairUnit > 0.005) {
    const n = earned / pairUnit;
    if (Math.abs(n - Math.round(n)) < 0.02) {
      const k = Math.round(n);
      return { inst: k, teach: k, present: k * 2 };
    }
  }
  const instUnit = (rateI / 100) * price;
  if (instUnit > 0.005) {
    const n = earned / instUnit;
    if (Math.abs(n - Math.round(n)) < 0.02) {
      const k = Math.round(n);
      return { inst: k, teach: 0, present: k };
    }
  }
  return { inst: 0, teach: 0, present: 0 };
}

/** Split a leftover cash payment into the actual lessons it covered (never one blob). */
function splitLeftoverPayment(opts: {
  amount: number;
  payment: { id: string; paidAt?: string; createdAt?: string };
  rows: DuesSessionRow[];
  rateI: number;
  rateT: number;
  price: number;
  fallbackGroup: string | null;
}): DuesSessionRow[] {
  const { amount, payment, rows, rateI, rateT, price, fallbackGroup } = opts;
  const day = String(payment.paidAt || payment.createdAt || "").slice(0, 10);
  const sameDay = rows.filter((r) => r.sessionDate === day);
  const extras = sameDay.filter((r) => r.earned > 0.005).sort((a, b) => b.earned - a.earned);
  const wiped = sameDay.filter((r) => r.earned <= 0.005 && r.startTime);
  const extraAmts = [...new Set(extras.map((e) => Math.round(e.earned * 100) / 100))].sort((a, b) => b - a);
  const parts: DuesSessionRow[] = [];
  let left = amount;
  const paidAt = String(payment.paidAt || payment.createdAt || "") || null;

  for (const extraAmt of extraAmts) {
    while (left + 0.005 >= extraAmt && extraAmt > 0.005) {
      const template = extras.find((e) => Math.abs(e.earned - extraAmt) < 0.02) || extras[0];
      const counts = inferClients(extraAmt, rateI, rateT, price);
      const regular = wiped[0] || sameDay.slice().sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))[0];
      let start = template?.startTime || null;
      let end = template?.endTime || null;
      if (regular?.endTime) {
        start = addMinutes(regular.endTime, 1);
        end = addMinutes(start, durationMinutes(template?.startTime || null, template?.endTime || null));
      }
      parts.push({
        id: `paid-history-${payment.id}-extra-${parts.length}`,
        sessionDate: day,
        startTime: start,
        endTime: end,
        createdAt: paidAt,
        groupName: template?.groupName || fallbackGroup,
        presentCount: counts.present || template?.presentCount || 0,
        institutionClients: counts.inst || template?.institutionClients || 0,
        teacherClients: counts.teach || template?.teacherClients || 0,
        earned: extraAmt,
        paidStatus: "paid",
      });
      left -= extraAmt;
    }
  }

  if (left > 0.005 && wiped[0]) {
    const counts = inferClients(left, rateI, rateT, price);
    parts.push({
      id: wiped[0].id,
      sessionDate: wiped[0].sessionDate,
      startTime: wiped[0].startTime,
      endTime: wiped[0].endTime,
      createdAt: wiped[0].createdAt,
      groupName: wiped[0].groupName || fallbackGroup,
      presentCount: counts.present,
      institutionClients: counts.inst,
      teacherClients: counts.teach,
      earned: left,
      paidStatus: "paid",
    });
    left = 0;
  }

  if (left > 0.005) {
    const counts = inferClients(left, rateI, rateT, price);
    parts.push({
      id: `paid-history-${payment.id}`,
      sessionDate: day || formatLocalYmd(new Date()),
      startTime: null,
      endTime: null,
      createdAt: paidAt,
      groupName: fallbackGroup,
      presentCount: counts.present,
      institutionClients: counts.inst,
      teacherClients: counts.teach,
      earned: left,
      paidStatus: "paid",
    });
  }
  return parts;
}

function applyCoveredRows(
  rows: DuesSessionRow[],
  byId: Map<string, DuesSessionRow>,
  snaps: DuesSessionRow[],
  earned: number
): number {
  for (const snap of snaps) {
    const live = byId.get(snap.id);
    if (live) {
      if (live.earned + 0.005 < snap.earned) {
        earned += snap.earned - live.earned;
        live.earned = snap.earned;
        live.presentCount = Math.max(live.presentCount, snap.presentCount);
        live.institutionClients = Math.max(live.institutionClients, snap.institutionClients);
        live.teacherClients = Math.max(live.teacherClients, snap.teacherClients);
        live.startTime = live.startTime || snap.startTime;
        live.endTime = live.endTime || snap.endTime;
      }
      live.paidStatus = "paid";
    } else {
      const row = { ...snap, paidStatus: "paid" as const };
      rows.push(row);
      byId.set(snap.id, row);
      earned += snap.earned;
    }
  }
  return earned;
}

/** Oldest unpaid lessons this payment covers — stored so they survive session deletes. */
export function snapshotSessionsForAmount(sessions: DuesSessionRow[], amount: number): DuesSessionRow[] {
  let budget = Number(amount) || 0;
  const covered: DuesSessionRow[] = [];
  const oldest = [...sessions].sort((a, b) => sessionSortKey(a).localeCompare(sessionSortKey(b)));
  for (const row of oldest) {
    if (budget <= 0.005) break;
    if (row.paidStatus === "paid") continue;
    if (row.earned <= 0.005) continue;
    if (budget + 0.005 >= row.earned) {
      covered.push({ ...row, paidStatus: "paid" });
      budget -= row.earned;
    }
  }
  return covered;
}

/** Extra added right after paying still counts as that payment. Later extras stay unpaid. */
const PAYMENT_COVER_GRACE_MS = 30 * 60 * 1000;

function sessionCoverableByPayment(
  session: { createdAt?: string | null },
  payment: { paidAt?: string; createdAt?: string }
): boolean {
  const paidAt = Date.parse(String(payment.paidAt || payment.createdAt || ""));
  const created = Date.parse(String(session.createdAt || ""));
  if (!Number.isFinite(paidAt) || !Number.isFinite(created)) return true;
  return created <= paidAt + PAYMENT_COVER_GRACE_MS;
}

/** Session end timestamp; null when unparsable. */
function endMs(s: { sessionDate: string; startTime?: string | null; endTime?: string | null }): number | null {
  const time = s.endTime || s.startTime || "00:00";
  const base = String(s.sessionDate).slice(0, 10);
  const ms = new Date(`${base}T${time}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Date+time+created so same-day extras sort after the earlier lesson. */
function sessionSortKey(s: {
  sessionDate: string;
  startTime?: string | null;
  endTime?: string | null;
  createdAt?: string | null;
}): string {
  const day = String(s.sessionDate).slice(0, 10);
  const time = String(s.endTime || s.startTime || "00:00").slice(0, 5);
  const created = String(s.createdAt || "");
  return `${day}T${time}\t${created}`;
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
    let sessQuery = supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime, status, createdAt")
      .eq("tenantId", tenantId)
      .in("groupId", groupIds);
    const todayStr = formatLocalYmd(new Date());
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const endDay = new Date(y, m, 0).getDate();
      const end = sessionDateUpperBound(`${y}-${String(m).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`);
      sessQuery = sessQuery.gte("sessionDate", start).lte("sessionDate", end);
    } else {
      // All taught history up to today — never pull years of future slots.
      sessQuery = sessQuery.lte("sessionDate", sessionDateUpperBound(todayStr));
    }
    const { data: allSessions } = await sessQuery.order("sessionDate", { ascending: false }).limit(5000);

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
    sessions.sort((a: any, b: any) => sessionSortKey(b).localeCompare(sessionSortKey(a)));
  }

  // ---- Attendance counting (plain queries + JS join; no embeds) ----------
  const presentBySession = new Map<string, number>();
  const instBySession = new Map<string, number>();
  const teachBySession = new Map<string, number>();
  const sessionGroupById = new Map<string, string>(sessions.map((s: any) => [s.id, s.groupId]));
  const sessionIds = sessions.map((s: any) => s.id);

  if (sessionIds.length > 0) {
    const [{ data: attendances }, { data: enrollments }] = await Promise.all([
      supabase.from("attendances").select("sessionId, studentId, status").eq("tenantId", tenantId).in("sessionId", sessionIds),
      supabase.from("group_students").select("groupId, studentId, clientType").eq("tenantId", tenantId).in("groupId", groupIds),
    ]);

    // Only load clientType for students who actually attended — never the full 30k table
    const attendedStudentIds = [...new Set((attendances || []).map((a: any) => a.studentId).filter(Boolean))];
    let clientTypeByStudent = new Map<string, string>();
    if (attendedStudentIds.length > 0) {
      const { data: students } = await supabase
        .from("students")
        .select("id, clientType")
        .eq("tenantId", tenantId)
        .in("id", attendedStudentIds);
      clientTypeByStudent = new Map((students || []).map((st: any) => [st.id, st.clientType || "institution"]));
    }
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
      startTime: s.startTime ? String(s.startTime).slice(0, 5) : null,
      endTime: s.endTime ? String(s.endTime).slice(0, 5) : null,
      createdAt: s.createdAt ? String(s.createdAt) : null,
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
    .select("id, amount, status, periodMonth, paidAt, createdAt, coveredSessions")
    .eq("tenantId", tenantId)
    .eq("teacherId", teacherId);

  const relevantPays = (payments || []).filter(
    (p: any) => p.status === "paid" && (!month || String(p.periodMonth).slice(0, 7) === month)
  );
  const paid = relevantPays.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const fallbackGroup = rows.find((r) => r.groupName)?.groupName || Array.from(groupNameById.values())[0] || null;
  const defaultPrice = Math.max(0, ...Array.from(groupPriceById.values()));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const p of relevantPays) {
    earned = applyCoveredRows(rows, byId, parseCoveredSessions(p.coveredSessions), earned);
  }

  // Each payment covers only lessons that existed when it was recorded
  // (plus a short grace for extras added immediately after paying).
  // Newer extras stay unpaid; leftover cash restores wiped lessons.
  const share = !perStudent && rows.length > 0 && earned > 0 ? earned / rows.length : 0;
  const paysOldest = [...relevantPays].sort((a: any, b: any) =>
    String(a.paidAt || a.createdAt || "").localeCompare(String(b.paidAt || b.createdAt || ""))
  );
  for (const p of paysOldest) {
    if (parseCoveredSessions(p.coveredSessions).length > 0) continue;

    let budget = Number(p.amount) || 0;
    const coveredLive: DuesSessionRow[] = [];
    const oldestUnpaid = [...rows]
      .filter((r) => r.paidStatus !== "paid" && sessionCoverableByPayment(r, p))
      .sort((a, b) => sessionSortKey(a).localeCompare(sessionSortKey(b)));

    for (const row of oldestUnpaid) {
      const due = perStudent ? row.earned : share;
      if (due <= 0.005) continue;
      if (budget + 0.005 < due) break;
      row.paidStatus = "paid";
      coveredLive.push({ ...row, paidStatus: "paid" });
      budget -= due;
    }

    let parts: DuesSessionRow[] = [];
    if (perStudent && budget > 0.005) {
      parts = splitLeftoverPayment({
        amount: budget,
        payment: p,
        rows,
        rateI: rateInstitution,
        rateT: rateTeacher,
        price: defaultPrice,
        fallbackGroup,
      });
      earned = applyCoveredRows(rows, byId, parts, earned);
    }

    const snapshot = [...coveredLive, ...parts];
    if (snapshot.length > 0) {
      await supabase
        .from("teacher_payments")
        .update({ coveredSessions: JSON.stringify(snapshot) })
        .eq("id", p.id)
        .eq("tenantId", tenantId);
    }
  }

  const visible = rows.filter((r) => r.earned > 0.005 || r.presentCount > 0);
  visible.sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)));

  return {
    salaryType,
    rateInstitution,
    rateTeacher,
    perStudent,
    monthlyMonths,
    sessions: visible,
    totals: {
      earned,
      paid,
      remaining: Math.max(0, earned - paid),
      overpaid: Math.max(0, paid - earned),
    },
  };
}
