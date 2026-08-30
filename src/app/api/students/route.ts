import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

/** Always paginated. Default limit 50, max 100. Never returns tens of thousands. */
export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = (searchParams.get("search") || searchParams.get("q") || "").trim();
    const id = searchParams.get("id");
    const excludeGroupId = searchParams.get("excludeGroupId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = (page - 1) * limit;
    const view = searchParams.get("view") || "lite";

    const cols =
      view === "full"
        ? "id, fullName, gradeLevel, schoolName, phone, fatherPhone, email, address, notes, monthlyFee, subscriptionStart, status, clientType, advanceBalance"
        : "id, fullName, gradeLevel, phone, status, monthlyFee, advanceBalance";

    let query = supabase
      .from("students")
      .select(cols)
      .eq("tenantId", tenantId)
      .order("fullName", { ascending: true })
      .range(offset, offset + limit - 1);

    if (id) query = query.eq("id", id);
    if (status) query = query.eq("status", status);
    if (search) {
      query = query.or(`fullName.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    let countQ = supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("tenantId", tenantId);
    if (id) countQ = countQ.eq("id", id);
    if (status) countQ = countQ.eq("status", status);
    if (search) countQ = countQ.or(`fullName.ilike.%${search}%,phone.ilike.%${search}%`);

    const [{ data: students }, countRes] = await Promise.all([query, countQ as any]);
    let rows = (students || []) as any[];

    if (excludeGroupId && rows.length > 0) {
      const { data: enrolled } = await supabase
        .from("group_students")
        .select("studentId")
        .eq("groupId", excludeGroupId)
        .eq("status", "active");
      const enrolledSet = new Set((enrolled || []).map((e: any) => e.studentId));
      rows = rows.filter((s) => !enrolledSet.has(s.id));
    }

    if ((view === "full" || id) && rows.length > 0) {
      const ids = rows.map((s) => s.id);
      const { data: enrollments } = await supabase
        .from("group_students")
        .select("studentId, groupId, clientType, status")
        .in("studentId", ids)
        .eq("status", "active");
      const groupIds = [...new Set((enrollments || []).map((e: any) => e.groupId).filter(Boolean))];
      const groupNameById = new Map<string, string>();
      if (groupIds.length > 0) {
        const { data: groupRows } = await supabase.from("groups").select("id, name").in("id", groupIds);
        for (const g of groupRows || []) groupNameById.set(g.id, g.name);
      }
      const byStudent = new Map<string, { clientType: string | null; group: { id: string; name: string } }[]>();
      for (const gs of enrollments || []) {
        const name = groupNameById.get(gs.groupId);
        if (!name) continue;
        const list = byStudent.get(gs.studentId) || [];
        list.push({ clientType: gs.clientType ?? null, group: { id: gs.groupId, name } });
        byStudent.set(gs.studentId, list);
      }
      rows = rows.map((s) => ({ ...s, groupStudents: byStudent.get(s.id) || [] }));
    }

    return NextResponse.json(
      { data: rows, total: countRes?.count ?? rows.length, page, limit },
      { headers: { "X-Total-Count": String(countRes?.count ?? rows.length) } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
