import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data: groups } = await supabase.from("groups").select("id, name").eq("tenantId", tenantId).eq("status", "active");

    const result: { groupName: string; rate: number }[] = [];
    for (const group of groups || []) {
      const { count: total } = await supabase
        .from("attendances")
        .select("*", { count: "exact", head: true })
        .eq("tenantId", tenantId)
        .eq("groupId", group.id);

      const { count: present } = await supabase
        .from("attendances")
        .select("*", { count: "exact", head: true })
        .eq("tenantId", tenantId)
        .eq("groupId", group.id)
        .in("status", ["present", "late"]);

      result.push({
        groupName: group.name,
        rate: (total ?? 0) > 0 ? Math.round(((present ?? 0) / (total ?? 1)) * 100) : 0,
      });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
