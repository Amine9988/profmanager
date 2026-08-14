import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import * as XLSX from "xlsx";

const HEADER_BG = "FF1D4ED8";
const TOTAL_BG = "FFDBEAFE";
const HEADER_FONT = "FFFFFFFF";
const BORDER = "FFCBD5E1";

const TYPE_LABELS: Record<string, string> = { income: "إيراد", expense: "مصروف" };
const CATEGORY_LABELS: Record<string, string> = {
  Paiement: "دفعات التلاميذ",
  Salaire: "أجور الأساتذة",
  Fournitures: "اللوازم",
  general: "عام",
};
const METHOD_LABELS: Record<string, string> = {
  cash: "نقدًا",
  cheque: "شيك",
  transfer: "تحويل بنكي",
  card: "بطاقة بنكية",
};
const SALARY_LABELS: Record<string, string> = {
  monthly: "شهري",
  fixed: "ثابت",
  per_student: "لكل تلميذ",
  per_hour: "بالساعة",
  per_session: "لكل حصة",
  percentage: "نسبة مئوية",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatAmount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function border() {
  const b = { style: "thin", color: { rgb: BORDER } };
  return { top: b, bottom: b, left: b, right: b };
}

function buildSheet(sheetName: string, headers: string[], rows: (string | number)[][]) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!dir"] = "rtl";

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: HEADER_FONT }, sz: 11 },
      fill: { fgColor: { rgb: HEADER_BG }, patternType: "solid" },
      alignment: { horizontal: "center", vertical: "center" },
      border: border(),
    };
  }

  for (let r = 1; r <= range.e.r; r++) {
    const first = rows[r - 1]?.[0];
    const isTotal = typeof first === "string" && (first === "الإجمالي" || first === "المجموع");
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = {
        font: isTotal ? { bold: true, color: { rgb: "FF1E3A8A" } } : undefined,
        fill: isTotal ? { fgColor: { rgb: TOTAL_BG }, patternType: "solid" } : undefined,
        numFmt: typeof cell.v === "number" ? "#,##0.##" : undefined,
        alignment: {
          horizontal: typeof cell.v === "number" ? "center" : "right",
          vertical: "center",
        },
        border: border(),
      };
    }
  }

  const widths: number[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    let max = headers[c].length;
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v != null) max = Math.max(max, String(cell.v).length);
    }
    widths.push(Math.min(max + 4, 50));
  }
  ws["!cols"] = widths.map((wch) => ({ wch }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (range.e.r > 0) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  }
  return ws;
}

function buildWorkbook(sheetName: string, headers: string[], rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(sheetName, headers, rows), sheetName.slice(0, 31));
  if (wb.Workbook) wb.Workbook.Views = [{ RTL: true }];
  return wb;
}

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const type = new URL(req.url).searchParams.get("type");
    const today = new Date().toISOString().split("T")[0];

    if (type === "cash") {
      const { data: movements } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("tenantId", tenantId)
        .order("date", { ascending: false })
        .order("createdAt", { ascending: false });

      const rows: (string | number)[][] = (movements || []).map((m, i) => [
        i + 1,
        fmtDate(m.date),
        TYPE_LABELS[m.type] || m.type,
        CATEGORY_LABELS[m.category] || m.category,
        Number(m.amount),
        METHOD_LABELS[m.paymentMethod] || m.paymentMethod,
        m.description || "—",
      ]);

      const income = (movements || [])
        .filter((m) => m.type === "income")
        .reduce((s, m) => s + Number(m.amount), 0);
      const expense = (movements || [])
        .filter((m) => m.type === "expense")
        .reduce((s, m) => s + Number(m.amount), 0);

      if (rows.length > 0) {
        rows.push([
          "الإجمالي",
          "",
          "",
          "",
          Math.round((income - expense) * 100) / 100,
          "",
          `إيراد: ${formatAmount(income)}  |  مصروف: ${formatAmount(expense)}`,
        ]);
      }

      const wb = buildWorkbook("سجل الصندوق", ["#", "التاريخ", "النوع", "الفئة", "المبلغ", "طريقة الدفع", "الوصف"], rows);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return fileResponse(buffer, `cash-register_${today}.xlsx`);
    }

    if (type === "teachers") {
      const { data: teachers } = await supabase
        .from("teachers")
        .select("*")
        .eq("tenantId", tenantId)
        .order("createdAt", { ascending: true });

      const { data: groups } = await supabase
        .from("groups")
        .select("id, teacherId")
        .eq("tenantId", tenantId);

      const teacherGroups = new Map<string, string[]>();
      const allGroupIds: string[] = [];
      for (const g of groups || []) {
        allGroupIds.push(g.id);
        if (!g.teacherId) continue;
        const list = teacherGroups.get(g.teacherId) || [];
        list.push(g.id);
        teacherGroups.set(g.teacherId, list);
      }

      let allSessions: any[] = [];
      let presentBySession = new Map<string, number>();
      if (allGroupIds.length > 0) {
        const { data: s } = await supabase
          .from("sessions")
          .select("id, groupId, sessionDate, startTime, endTime, status")
          .eq("tenantId", tenantId)
          .in("groupId", allGroupIds);
        allSessions = s || [];
        const sessionIds = allSessions.map((x) => x.id);
        if (sessionIds.length > 0) {
          const { data: a } = await supabase
            .from("attendances")
            .select("sessionId, status")
            .eq("tenantId", tenantId)
            .in("sessionId", sessionIds);
          presentBySession = new Map<string, number>();
          for (const att of a || []) {
            if (att.status === "present" || att.status === "late") {
              presentBySession.set(att.sessionId, (presentBySession.get(att.sessionId) || 0) + 1);
            }
          }
        }
      }

      const { data: teacherPayments } = await supabase
        .from("teacher_payments")
        .select("teacherId, amount, status")
        .eq("tenantId", tenantId);

      const paidByTeacher = new Map<string, number>();
      for (const p of teacherPayments || []) {
        if (p.status !== "paid") continue;
        paidByTeacher.set(p.teacherId, (paidByTeacher.get(p.teacherId) || 0) + Number(p.amount || 0));
      }

      const now = Date.now();
      const rows: (string | number)[][] = (teachers || []).map((t, i) => {
        const rate = Number(t.salaryAmount) || 0;
        const salaryType = t.salaryType || "fixed";
        const groupIds = teacherGroups.get(t.id) || [];
        const taught = allSessions.filter((s) => {
          if (!groupIds.includes(s.groupId) || s.status === "cancelled") return false;
          const time = s.endTime || s.startTime || "00:00";
          const endMs = new Date(`${s.sessionDate}T${time}`).getTime();
          return !isNaN(endMs) && endMs < now;
        });

        let earned = 0;
        if (salaryType === "per_student") {
          earned = taught.reduce((sum, s) => sum + (presentBySession.get(s.id) || 0) * rate, 0);
        } else if (rate > 0) {
          earned = new Set(taught.map((s) => String(s.sessionDate).slice(0, 7))).size * rate;
        }
        const paid = paidByTeacher.get(t.id) || 0;
        return [
          i + 1,
          [t.firstName, t.lastName].filter(Boolean).join(" "),
          t.phone || "",
          SALARY_LABELS[salaryType] || salaryType,
          rate,
          paid,
          earned - paid,
        ];
      });

      const wb = buildWorkbook(
        "سجل الأساتذة",
        ["#", "الاسم الكامل", "الهاتف", "نوع الراتب", "مبلغ الراتب", "الراتب المدفوع", "الراتب المتبقي"],
        rows
      );
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return fileResponse(buffer, `teachers_${today}.xlsx`);
    }

    if (type === "students") {
      const { data: students } = await supabase
        .from("students")
        .select("*")
        .eq("tenantId", tenantId)
        .order("fullName", { ascending: true });

      const { data: payments } = await supabase
        .from("payments")
        .select("studentId, amountDue, amountPaid")
        .eq("tenantId", tenantId);

      const statsByStudent = new Map<string, { paid: number; remaining: number }>();
      for (const p of payments || []) {
        const cur: { paid: number; remaining: number } = statsByStudent.get(p.studentId) || { paid: 0, remaining: 0 };
        const due = Number(p.amountDue) || 0;
        const paidAmt = Number(p.amountPaid) || 0;
        cur.paid += paidAmt;
        cur.remaining += Math.max(due - paidAmt, 0);
        statsByStudent.set(p.studentId, cur);
      }

      const rows: (string | number)[][] = (students || []).map((s, i) => {
        const st = statsByStudent.get(s.id) || { paid: 0, remaining: 0 };
        return [
          i + 1,
          s.fullName,
          s.gradeLevel || "",
          s.phone || "",
          s.fatherPhone || "",
          fmtDate(s.enrolledAt),
          Math.round(st.paid * 100) / 100,
          Math.round(st.remaining * 100) / 100,
        ];
      });

      const wb = buildWorkbook(
        "سجل التلاميذ",
        ["#", "الاسم الكامل", "المستوى", "الهاتف", "هاتف الأب", "تاريخ التسجيل", "المدفوع", "المتبقي"],
        rows
      );
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return fileResponse(buffer, `students_${today}.xlsx`);
    }

    return NextResponse.json({ error: "Unsupported export type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function fileResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
