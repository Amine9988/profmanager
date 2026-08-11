import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, tenantId } = await getTenantContext();

    const { data: student } = await supabase
      .from("students")
      .select("id, fullName, gradeLevel, schoolName")
      .eq("id", id)
      .eq("tenantId", tenantId)
      .single();

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, schoolPhone, schoolLogo")
      .eq("id", tenantId)
      .single();

    return Response.json({
      student: {
        id: student.id,
        fullName: student.fullName,
        gradeLevel: student.gradeLevel,
        schoolName: student.schoolName,
      },
      tenant: {
        name: tenant?.name || null,
        schoolPhone: tenant?.schoolPhone || null,
        schoolLogo: tenant?.schoolLogo || null,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
