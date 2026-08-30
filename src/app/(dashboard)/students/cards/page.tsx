import { getTenantContext } from "@/lib/auth";
import { StudentCardsClient } from "@/components/student-cards/page-client";

export const dynamic = "force-dynamic";

async function getTenant() {
  const { supabase, tenantId } = await getTenantContext();
  const { data } = await supabase
    .from("tenants")
    .select("name, schoolPhone, schoolLogo")
    .eq("id", tenantId)
    .single();
  return data || { name: "ProfManager", schoolPhone: null, schoolLogo: null };
}

async function getLevels() {
  const { supabase, tenantId } = await getTenantContext();
  const { data } = await supabase
    .from("levels")
    .select("nameAr")
    .eq("tenantId", tenantId)
    .eq("status", "active")
    .order("sortOrder", { ascending: true });
  return (data || []).map((l: any) => l.nameAr);
}

export default async function StudentCardsPage() {
  // Do NOT preload all students — client searches via /api/students
  const [tenant, levels] = await Promise.all([getTenant(), getLevels()]);

  return (
    <StudentCardsClient
      students={[]}
      tenant={tenant}
      levels={levels}
    />
  );
}
