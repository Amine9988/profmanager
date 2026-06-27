"use server";

import { getTenantContext } from "@/lib/auth";

export async function searchStudents(query: string) {
  const { tenantId, supabase } = await getTenantContext();

  if (!query || query.trim().length < 1) return [];

  const q = query.trim();

  const { data: students } = await supabase
    .from("students")
    .select("id, fullName, phone, gradeLevel, group_students(groupId, groups(name))")
    .eq("tenantId", tenantId)
    .eq("status", "active")
    .or(`fullName.ilike.%${q}%,phone.ilike.%${q}%,id.ilike.%${q}%`)
    .limit(10);

  return (students || []).map((s: any) => ({
    id: s.id,
    fullName: s.fullName,
    phone: s.phone ?? "",
    gradeLevel: s.gradeLevel ?? "",
    groups: ((s.groupStudents || []) as any[]).map((gs: any) => gs.groups?.name || gs.group?.name).filter(Boolean),
  })) as any;
}
