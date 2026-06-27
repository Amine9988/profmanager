import { getDashboardKPIs, getOverdueStudents, getRevenueByMonth, getStudentGrowth, getSessionStatsDashboard, getRecentPayments, getRecentOverduePayments } from "@/server/actions/dashboard";
import { getDailySummary } from "@/server/actions/daily-summary";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GenerateSessionsButton } from "@/components/shared/generate-sessions-button";
import {
  Users, Wallet, Clock, CheckCheck, X, ListChecks,
  AlertTriangle, BadgeDollarSign, Plus, DollarSign, CalendarCheck,
  BarChart3, Calendar, Percent, Banknote, GraduationCap,
  BookOpen, TrendingUp, Bell,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const locale = await getInitialLocale();
  const [kpis, overdueStudents, revenueData, , t, summary, sessionStats, recentPayments, recentOverdue] = await Promise.all([
    getDashboardKPIs(),
    getOverdueStudents(),
    getRevenueByMonth(),
    getStudentGrowth(),
    getT(locale),
    getDailySummary(),
    getSessionStatsDashboard(),
    getRecentPayments(5),
    getRecentOverduePayments(5),
  ]);
  const fmt = (v: number) => formatCurrency(v);

  return (
    <div className="space-y-6 p-4 md:p-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/students">
            <Button size="sm"><Plus className="mr-1 size-4" />{t("students.add")}</Button>
          </Link>
          <Link href={`/students?action=payment`}>
            <Button size="sm" variant="outline"><DollarSign className="mr-1 size-4" />{t("payments.record_button")}</Button>
          </Link>
          <Link href="/attendance">
            <Button size="sm" variant="outline"><CalendarCheck className="mr-1 size-4" />{t("attendance.title")}</Button>
          </Link>
          <Link href="/reports">
            <Button size="sm" variant="outline"><BarChart3 className="mr-1 size-4" />{t("reports.title")}</Button>
          </Link>
          <Link href="/calendar">
            <Button size="sm" variant="outline"><Calendar className="mr-1 size-4" />{t("calendar.title")}</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/overdue">
          <Card className="border-destructive/20 bg-destructive/5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 overflow-hidden">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-xl bg-destructive/10 p-2.5">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive tracking-tight">{summary.overdueSubs}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.overdue_title")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/overdue">
          <Card className="border-warning/20 bg-warning/5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 overflow-hidden">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-xl bg-warning/10 p-2.5">
                <Clock className="size-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning tracking-tight">{summary.expiringSubs}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.expiring_soon")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/payments">
          <Card className="border-blue-500/20 bg-blue-500/5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 overflow-hidden">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-xl bg-blue-500/10 p-2.5">
                <ListChecks className="size-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-500 tracking-tight">{summary.expectedPaymentsCount}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.pending_payments")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/attendance">
          <Card className="border-orange-500/20 bg-orange-500/5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 overflow-hidden">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-xl bg-orange-500/10 p-2.5">
                <X className="size-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500 tracking-tight">{summary.todayAbsences}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.today_absent")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label={t("dashboard.active_students")} value={kpis.activeStudents} icon={Users} href="/students" />
        <KpiCard label={t("caisse.title")} value={fmt(kpis.caisseBalance)} icon={Banknote} tone={kpis.caisseBalance >= 0 ? "success" : "destructive"} href="/caisse" />
        <KpiCard label={t("teachers.title")} value={kpis.teacherCount} icon={GraduationCap} href="/teachers" />
        <KpiCard label={t("dashboard.subjects")} value={kpis.subjectCount} icon={BookOpen} href="/subjects" />
        <KpiCard label={t("dashboard.collected_today")} value={fmt(kpis.todayPaymentsTotal)} icon={Wallet} tone="success" />
        <KpiCard
          label={t("payments.up_to_date")}
          value={kpis.upToDateSubs}
          icon={CheckCheck}
          tone="success"
          href="/payments"
        />
        <KpiCard
          label={t("payments.overdue_payments")}
          value={kpis.overdueSubs}
          icon={AlertTriangle}
          tone={kpis.overdueSubs > 0 ? "destructive" : "success"}
          href="/overdue"
        />
        <KpiCard
          label={t("dashboard.revenue_month")}
          value={fmt(kpis.revenueThisMonth)}
          icon={TrendingUp}
          tone="success"
          href="/payments"
        />
        <KpiCard
          label={t("payments.total_debt")}
          value={fmt(kpis.totalDebt)}
          icon={BadgeDollarSign}
          tone={kpis.totalDebt > 0 ? "warning" : "default"}
          href="/overdue"
        />
        <KpiCard
          label={t("dashboard.expiring_soon")}
          value={kpis.expiringSubs}
          icon={Clock}
          tone={kpis.expiringSubs > 0 ? "warning" : "success"}
          href="/overdue"
        />
        <KpiCard
          label={t("dashboard.recovery_rate")}
          value={`${kpis.recoveryRate}%`}
          icon={Percent}
          tone={kpis.recoveryRate >= 75 ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.today_sessions")}</CardTitle>
            <Badge variant="secondary">{kpis.todaySessions.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {kpis.todaySessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CalendarCheck className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t("dashboard.no_sessions_today")}</p>
                <GenerateSessionsButton />
              </div>
            ) : (
              kpis.todaySessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/attendance/session/${s.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent hover:border-accent transition-all duration-200"
                >
                  <span className="font-medium">{s.group?.name ?? "?"}</span>
                  <span className="text-muted-foreground text-xs">{s.startTime}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.today_payments_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.todayPayments.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Wallet className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t("dashboard.no_payments_today")}</p>
              </div>
            ) : (
              summary.todayPayments.map((p) => (
                <Link
                  key={p.id}
                  href={`/students/${p.studentId}`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent hover:border-accent transition-all duration-200"
                >
                  <span className="font-medium">{p.student.fullName}</span>
                  <span className="text-muted-foreground tabular-nums">{fmt(Number(p.amountPaid))}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.revenue_evolution")}</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <BarChart3 className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t("dashboard.no_revenue_data")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {revenueData.slice(-12).map((r: { month: string; total: number }) => (
                <div key={r.month} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground text-xs">{r.month}</span>
                  <div className="flex-1 h-6 rounded-lg bg-primary/5 overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-primary transition-all duration-500"
                      style={{ width: `${Math.min((r.total / Math.max(...revenueData.map((x: any) => x.total))) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right font-medium tabular-nums">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="size-4 text-muted-foreground" />{t("dashboard.alerts_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overdueStudents.length === 0 && kpis.expiringSubs === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCheck className="size-8 text-success/50" />
              <p className="text-sm text-muted-foreground">{t("dashboard.no_alerts")}</p>
            </div>
          ) : (
            <>
              {overdueStudents.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
                  <div className="rounded-lg bg-destructive/10 p-1.5">
                    <AlertTriangle className="size-4 text-destructive" />
                  </div>
                  <span>{t("dashboard.overdue_alert", { count: overdueStudents.length })}</span>
                </div>
              )}
              {kpis.expiringSubs > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3 text-sm">
                  <div className="rounded-lg bg-warning/10 p-1.5">
                    <Clock className="size-4 text-warning" />
                  </div>
                  <span>{t("dashboard.expiring_alert", { count: kpis.expiringSubs })}</span>
                </div>
              )}
              {kpis.attendanceRate > 0 && kpis.attendanceRate < 75 && (
                <div className="flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-sm">
                  <div className="rounded-lg bg-orange-500/10 p-1.5">
                    <X className="size-4 text-orange-500" />
                  </div>
                  <span>{t("dashboard.attendance_alert", { rate: kpis.attendanceRate })}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.session_stats")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold tracking-tight">{sessionStats.total}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.total_sessions")}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-success/5">
              <p className="text-2xl font-bold tracking-tight text-success">{sessionStats.completed}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.completed_sessions")}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-destructive/5">
              <p className="text-2xl font-bold tracking-tight text-destructive">{sessionStats.cancelled}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.cancelled_sessions")}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-purple-500/5">
              <p className="text-2xl font-bold tracking-tight text-purple-600">{sessionStats.extra}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.extra_sessions")}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-warning/5">
              <p className="text-2xl font-bold tracking-tight text-warning">{sessionStats.makeup}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.makeup_sessions")}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-500/5">
              <p className="text-2xl font-bold tracking-tight text-blue-600">{sessionStats.remaining}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.remaining_sessions")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.recent_payments")}</CardTitle>
          <Link href="/payments" className="text-sm text-primary hover:underline font-medium">{t("common.viewAll")}</Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentPayments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-2">
              <DollarSign className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t("dashboard.no_recent_payments")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.student")}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.subject")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.amount")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors duration-150">
                      <td className="px-4 py-3 font-medium">{p.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.subject || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">{p.date ? formatDate(p.date) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.recent_overdue")}</CardTitle>
            <Link href="/overdue" className="text-sm text-primary hover:underline font-medium">{t("common.viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentOverdue.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-2">
                <CheckCheck className="size-8 text-success/50" />
                <p className="text-sm text-muted-foreground">{t("dashboard.no_overdue")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.student")}</th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.subject")}</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("payments.remaining")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOverdue.map((p: any) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors duration-150">
                        <td className="px-4 py-3 font-medium">{p.studentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.subject || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-destructive tabular-nums">{fmt(p.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.overdue_title")}</CardTitle>
            <Link href="/overdue" className="text-sm text-primary hover:underline font-medium">{t("common.viewAll")}</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueStudents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCheck className="size-8 text-success/50" />
                <p className="text-sm text-muted-foreground">{t("dashboard.no_overdue")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueStudents.slice(0, 5).map((s) => (
                  <Link
                    key={s.studentId}
                    href={`/students/${s.studentId}`}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm hover:bg-destructive/10 transition-all duration-200"
                  >
                    <span className="font-medium truncate">{s.fullName}</span>
                    <Badge variant="destructive">{fmt(s.balance)}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
