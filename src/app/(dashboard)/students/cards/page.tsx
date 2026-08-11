import { getTenantContext } from "@/lib/auth";
import { StudentCardsClient } from "@/components/student-cards/page-client";

export const dynamic = "force-dynamic";

async function getStudents() {
  const { supabase, tenantId } = await getTenantContext();
  const { data } = await supabase
    .from("students")
    .select("id, fullName, gradeLevel, schoolName, phone, address")
    .eq("tenantId", tenantId)
    .eq("status", "active")
    .order("fullName", { ascending: true });
  return (data || []).map((s: any) => ({
    ...s,
    registrationNumber: "",
  }));
}

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
  const [students, tenant, levels] = await Promise.all([getStudents(), getTenant(), getLevels()]);

  const distinctLevels = [...new Set(students.map((s: any) => s.gradeLevel).filter(Boolean))] as string[];

  return (
    <StudentCardsClient
      students={students}
      tenant={tenant}
      levels={[...new Set([...levels, ...distinctLevels])]}
    />
  );
}
