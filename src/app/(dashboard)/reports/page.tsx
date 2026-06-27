"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/kpi-card";

const RevenueChart = dynamic(() => import("@/components/charts/revenue-chart").then(m => m.RevenueChart), { ssr: false });
const StudentGrowthChart = dynamic(() => import("@/components/charts/student-growth-chart").then(m => m.StudentGrowthChart), { ssr: false });
import {
  BarChart3, FileSpreadsheet, FileText, TrendingUp, Users, Wallet,
  AlertTriangle, CalendarCheck, UserCheck, DollarSign, PieChart,
} from "lucide-react";
import { toast } from "sonner";

type ReportTab = "overview" | "students" | "payments" | "overdue" | "caisse" | "sessions" | "attendance" | "stats" | "revenue";

const tabs: { key: ReportTab; labelKey: string; icon: any }[] = [
  { key: "overview", labelKey: "reports.overview", icon: BarChart3 },
  { key: "students", labelKey: "reports.studentReport", icon: Users },
  { key: "payments", labelKey: "reports.paymentReport", icon: Wallet },
  { key: "overdue", labelKey: "reports.overdue", icon: AlertTriangle },
  { key: "caisse", labelKey: "caisse.title", icon: DollarSign },
  { key: "sessions", labelKey: "reports.sessions", icon: CalendarCheck },
  { key: "attendance", labelKey: "reports.attendanceReport", icon: UserCheck },
  { key: "stats", labelKey: "reports.stats", icon: PieChart },
  { key: "revenue", labelKey: "reports.monthlyRevenue", icon: TrendingUp },
];

async function exportToExcel(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) {
    toast("No data to export");
    return;
  }
  try {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rapport");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch {
    const csv = [Object.keys(data[0]).join(","), ...data.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
  }
}

function exportToPDF() {
  window.print();
}

export default function ReportsPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [revenueData, setRevenueData] = useState<{ month: string; total: number }[]>([]);
  const [growthData, setGrowthData] = useState<{ month: string; count: number }[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [caisseData, setCaisseData] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/reports/revenue"),
      fetch("/api/reports/growth"),
      fetch("/api/payments?year=2026&month=6"),
      fetch("/api/students?status=active"),
      fetch("/api/reports/attendance"),
      fetch("/api/groups?status=active"),
      fetch("/api/reports/sessions"),
      fetch("/api/caisse/stats"),
    ]).then(async ([revRes, growRes, payRes, studRes, attRes, groupRes, sessRes, caisseRes]) => {
      if (revRes.ok) setRevenueData(await revRes.json());
      if (growRes.ok) setGrowthData(await growRes.json());
      if (payRes.ok) setPayments(await payRes.json());
      if (studRes.ok) setStudents(await studRes.json());
      if (attRes.ok) setAttendanceData(await attRes.json());
      if (groupRes.ok) setGroups(await groupRes.json());
      if (sessRes.ok) setSessions(await sessRes.json());
      if (caisseRes.ok) setCaisseData(await caisseRes.json());
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fmt = (v: number) => formatCurrency(v);

  function getExportData(): Record<string, unknown>[] {
    switch (activeTab) {
      case "payments": return payments.map((p: any) => ({
        [t("common.student")]: p.student?.fullName || "",
        [t("payments.amount_due")]: p.amountDue,
        [t("payments.amount_paid")]: p.amountPaid,
        [t("payments.status")]: p.status,
        [t("common.receipt")]: p.receiptNumber || "",
      }));
      case "students": return students.map((s: any) => ({
        [t("common.name")]: s.fullName,
        [t("common.level")]: s.level || "",
        [t("common.phone")]: s.phone || "",
        [t("common.status")]: s.status,
      }));
      case "overdue": return payments.filter((p: any) => p.status === "overdue").map((p: any) => ({
        [t("common.student")]: p.student?.fullName || "",
        [t("payments.amount_due")]: p.amountDue,
        [t("payments.amount_paid")]: p.amountPaid,
        [t("payments.remaining")]: p.amountDue - p.amountPaid,
      }));
      case "attendance": return attendanceData.map((a: any) => ({
        [t("common.group")]: a.groupName || "",
        [t("attendance.percentage")]: `${a.rate}%`,
      }));
      default: return [];
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("reports.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToExcel(getExportData(), `rapport-${activeTab}`)}>
            <FileSpreadsheet className="size-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <FileText className="size-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <tab.icon className="size-4 inline mr-1" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-6">
          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard label={t("reports.totalRevenue")} value={fmt(revenueData.reduce((s, r) => s + r.total, 0))} icon={Wallet} tone="success" />
                <KpiCard label={t("students.title")} value={students.length} icon={Users} />
                <KpiCard label={t("reports.thisMonth")} value={fmt(revenueData[revenueData.length - 1]?.total || 0)} icon={TrendingUp} />
                <KpiCard label={t("caisse.balance")} value={fmt(caisseData?.balance || 0)} icon={DollarSign} tone={caisseData?.balance >= 0 ? "success" : "warning"} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">{t("reports.monthlyRevenue")}</CardTitle></CardHeader>
                  <CardContent><RevenueChart data={revenueData} /></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">{t("reports.studentGrowth")}</CardTitle></CardHeader>
                  <CardContent><StudentGrowthChart data={growthData} /></CardContent>
                </Card>
              </div>
            </>
          )}

          {activeTab === "students" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.studentReport")}</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead><tr className="text-muted-foreground">
                      <th className="px-3 py-2 text-left">{t("common.name")}</th>
                      <th className="px-3 py-2 text-left">{t("common.level")}</th>
                      <th className="px-3 py-2 text-left">{t("common.phone")}</th>
                      <th className="px-3 py-2 text-left">{t("common.status")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {students.map((s: any) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{s.fullName}</td>
                          <td className="px-3 py-2">{s.level || "—"}</td>
                          <td className="px-3 py-2">{s.phone || "—"}</td>
                          <td className="px-3 py-2">{s.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "payments" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.paymentReport")}</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead><tr className="text-muted-foreground">
                      <th className="px-3 py-2 text-left">{t("common.student")}</th>
                      <th className="px-3 py-2 text-left">{t("common.receipt")}</th>
                      <th className="px-3 py-2 text-left">{t("payments.amount_due")}</th>
                      <th className="px-3 py-2 text-left">{t("payments.amount_paid")}</th>
                      <th className="px-3 py-2 text-left">{t("payments.status")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {payments.map((p: any) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{p.student?.fullName || "?"}</td>
                          <td className="px-3 py-2 text-xs font-mono">{p.receiptNumber || "—"}</td>
                          <td className="px-3 py-2">{fmt(p.amountDue)}</td>
                          <td className="px-3 py-2">{fmt(p.amountPaid)}</td>
                          <td className="px-3 py-2">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "overdue" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.overdue")}</CardTitle></CardHeader>
              <CardContent>
                {payments.filter((p: any) => p.status === "overdue").length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.no_overdue")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead><tr className="text-muted-foreground">
                        <th className="px-3 py-2 text-left">{t("common.student")}</th>
                        <th className="px-3 py-2 text-left">{t("payments.amount_due")}</th>
                        <th className="px-3 py-2 text-left">{t("payments.amount_paid")}</th>
                        <th className="px-3 py-2 text-left">{t("payments.remaining")}</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border">
                        {payments.filter((p: any) => p.status === "overdue").map((p: any) => (
                          <tr key={p.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{p.student?.fullName || "?"}</td>
                            <td className="px-3 py-2">{fmt(p.amountDue)}</td>
                            <td className="px-3 py-2">{fmt(p.amountPaid)}</td>
                            <td className="px-3 py-2 text-red-600">{fmt(p.amountDue - p.amountPaid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "caisse" && caisseData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t("caisse.balance")}</p>
                  <p className={`text-2xl font-bold ${caisseData.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(caisseData.balance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t("caisse.income")}</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(caisseData.totalIncome)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t("caisse.expense")}</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(caisseData.totalExpense)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "attendance" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.attendanceReport")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {attendanceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
                ) : (
                  attendanceData.map((a: any) => (
                    <div key={a.groupName} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{a.groupName}</span>
                        <span className="text-muted-foreground">{a.rate}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${a.rate}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "stats" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.stats")}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-lg border">
                    <p className="text-2xl font-bold">{students.length}</p>
                    <p className="text-xs text-muted-foreground">{t("students.title")}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg border">
                    <p className="text-2xl font-bold">{groups.length}</p>
                    <p className="text-xs text-muted-foreground">{t("groups.title")}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg border">
                    <p className="text-2xl font-bold">{sessions.length}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.total_sessions")}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg border">
                    <p className="text-2xl font-bold">{payments.filter((p: any) => p.status === "paid").length}</p>
                    <p className="text-xs text-muted-foreground">{t("payments.paid")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "revenue" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.monthlyRevenue")}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <RevenueChart data={revenueData} />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "sessions" && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("reports.sessions")}</CardTitle></CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead><tr className="text-muted-foreground">
                        <th className="px-3 py-2 text-left">{t("common.date")}</th>
                        <th className="px-3 py-2 text-left">{t("common.time")}</th>
                        <th className="px-3 py-2 text-left">{t("common.group")}</th>
                        <th className="px-3 py-2 text-left">{t("common.status")}</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border">
                        {sessions.map((s: any) => (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2">{formatDate(s.sessionDate)}</td>
                            <td className="px-3 py-2">{s.startTime || "—"}</td>
                            <td className="px-3 py-2 font-medium">{s.groups?.name || "?"}</td>
                            <td className="px-3 py-2">{s.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
