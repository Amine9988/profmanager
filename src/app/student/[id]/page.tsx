import { getTenantContext } from "@/lib/auth";
import { headers } from "next/headers";
import { submitScan } from "@/server/scan-sessions";
import { formatDate } from "@/lib/utils";
import { StudentPrintButton } from "./print-button";
import { StudentRelay } from "./relay";

export const dynamic = "force-dynamic";

async function getStudentData(id: string) {
  const { supabase, tenantId } = await getTenantContext();
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("tenantId", tenantId)
    .single();
  if (!student) return null;

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("studentId", id)
    .eq("tenantId", tenantId)
    .order("month", { ascending: false });

  const { data: attendances } = await supabase
    .from("attendances")
    .select("*, sessions(*)")
    .eq("studentId", id)
    .eq("tenantId", tenantId)
    .order("markedAt", { ascending: false });

  return { student, payments: payments || [], attendances: attendances || [] };
}

export default async function StudentPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStudentData(id);

  const hdrs = await headers();
  const ua = hdrs.get("user-agent") || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (data && isMobile) {
    submitScan(id, data.student.fullName);
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">التلميذ غير موجود</h1>
          <p className="text-gray-500">هذا الرابط غير صالح أو أن التلميذ غير مسجل في النظام</p>
        </div>
      </div>
    );
  }

  const { student, payments, attendances } = data;

  const lastPayment = payments.length > 0 ? payments[0] : null;
  const nextDueDate = lastPayment
    ? new Date(
        new Date(lastPayment.month).getTime() + 32 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .substring(0, 7)
    : null;
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);
  const totalDue = payments.reduce((s: number, p: any) => s + (p.amountDue || 0), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 print:bg-white" style={{ fontFamily: "system-ui, sans-serif" }}>
      <StudentPrintButton fullName={student.fullName} />
      <StudentRelay fullName={student.fullName} />
      <div className="max-w-2xl mx-auto p-6 space-y-6" style={{ paddingTop: "2rem" }}>
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-primary">
              {student.fullName.charAt(0)}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
          {student.gradeLevel && (
            <p className="text-sm text-slate-500 mt-1">{student.gradeLevel}</p>
          )}
          {student.schoolName && (
            <p className="text-sm text-slate-400 mt-0.5">{student.schoolName}</p>
          )}
          <div className="flex items-center justify-center gap-6 mt-4 text-sm text-slate-500" />
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">الاشتراكات والمدفوعات</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{totalPaid.toLocaleString()} د.ج</p>
              <p className="text-xs text-emerald-500 mt-1">المبلغ المدفوع</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{(totalDue - totalPaid).toLocaleString()} د.ج</p>
              <p className="text-xs text-amber-500 mt-1">المبلغ المتبقي</p>
            </div>
          </div>
          {lastPayment && (
            <div className="border-t border-slate-100 pt-3 text-sm text-slate-600 space-y-1">
              <p>آخر دفعة: {new Date(lastPayment.month).toLocaleDateString("ar-DZ", { year: "numeric", month: "long" })} — {lastPayment.amountPaid.toLocaleString()} د.ج</p>
              {nextDueDate && (
                <p>الدفعة القادمة: {new Date(nextDueDate + "-01").toLocaleDateString("ar-DZ", { year: "numeric", month: "long" })}</p>
              )}
            </div>
          )}
        </div>

        {/* Attendance History */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">سجل الحضور</h2>
          {attendances.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">لا توجد سجلات حضور</p>
          ) : (
            <div className="space-y-2">
              {attendances.slice(0, 50).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-50 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`size-2 rounded-full ${a.status === "present" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-slate-700">
                      {a.sessions?.sessionDate
                        ? `${new Date(a.sessions.sessionDate).toLocaleDateString("ar-DZ")}${a.sessions.startTime ? ` — ${a.sessions.startTime}` : ""}`
                        : `جلسة ${a.sessionId?.substring(0, 6)}`}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${a.status === "present" ? "text-emerald-600" : "text-red-600"}`}>
                    {a.status === "present" ? "حاضر" : "غائب"}
                  </span>
                </div>
              ))}
              {attendances.length > 50 && (
                <p className="text-center text-xs text-slate-400 pt-2">و {attendances.length - 50} أخرى...</p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 pb-8">ProfManager — بطاقة التلميذ</p>
      </div>
      <style>{`@media print{@page{margin:15mm}.no-print{display:none!important}}`}</style>
    </div>
  );
}
