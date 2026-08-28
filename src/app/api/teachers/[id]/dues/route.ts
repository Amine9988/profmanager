import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { computeTeacherDues } from "@/lib/teacher-dues";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { id } = await params;
    const month = req.nextUrl.searchParams.get("month") || null;

    const result = await computeTeacherDues(supabase, tenantId, id, month);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: teacherRes } = await supabase
      .from("teachers")
      .select("id, firstName, lastName")
      .eq("tenantId", tenantId)
      .eq("id", id)
      .single();
    const teacher = (teacherRes as any) || {};

    return NextResponse.json({
      teacher: {
        id: teacher.id ?? id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        salaryType: result.salaryType,
        salaryAmount: result.rateInstitution,
        salaryAmountTeacher: result.rateTeacher,
      },
      scope: month || "all",
      perStudent: result.perStudent,
      rate: result.rateInstitution,
      rateTeacher: result.rateTeacher,
      monthlyMonths: result.monthlyMonths,
      sessions: result.sessions,
      totals: {
        earned: result.totals.earned,
        paid: result.totals.paid,
        remaining: result.totals.remaining,
        overpaid: result.totals.overpaid,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to compute dues" }, { status: 500 });
  }
}
