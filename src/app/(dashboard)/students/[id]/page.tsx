import { notFound } from "next/navigation";
import Link from "next/link";
import { getStudent } from "@/server/actions/students";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate, initials, sessionCounterDisplay } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentEditDialog } from "@/components/students/student-edit-dialog";
import { CardDialog } from "@/components/students/card-dialog";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  present: "success",
  absent: "destructive",
  late: "warning",
  excused: "secondary",
};

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getInitialLocale();
  const [student, t] = await Promise.all([
    getStudent(id),
    getT(locale),
  ]);
  const fmt = (v: number) => formatCurrency(v);

  if (!student) notFound();

  const groups = (student.groupStudents as any[])
    .filter((gs: any) => gs.status === "active")
    .map((gs: any) => ({
      id: gs.group?.id ?? "?",
      name: gs.group?.name ?? "?",
      sessionsIncluded: gs.group?.sessionsIncluded != null ? Number(gs.group.sessionsIncluded) : null,
      consumedSessions: gs.consumedSessions != null ? Number(gs.consumedSessions) : 0,
      paidSessions: gs.paidSessions != null ? Number(gs.paidSessions) : 0,
    }));

  const totalPaid = (student.payments as any[]).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0);
  const totalDue = (student.payments as any[]).reduce((sum: number, p: any) => sum + Number(p.amountDue), 0);
  const currentDebt = totalDue - totalPaid;

  const paidGroupMonths = new Set(
    (student.payments as any[])
      .filter((p: any) => p.status === "paid" && p.groupId)
      .map((p: any) => `${p.groupId}:${String(p.month).slice(0, 7)}`)
  );
  const paidMonthsAnyGroup = new Set(
    (student.payments as any[])
      .filter((p: any) => p.status === "paid" && !p.groupId)
      .map((p: any) => String(p.month).slice(0, 7))
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg">{initials(student.fullName)}</AvatarFallback>
          </Avatar>
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold">{student.fullName}</h1>
              <p className="text-sm text-muted-foreground">
                {student.gradeLevel ?? t("students.no_level")}
                {student.schoolName ? ` \u00B7 ${student.schoolName}` : ""}
              </p>
            </div>
            <StudentEditDialog student={student} />
            <CardDialog studentId={student.id} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{t("payments.monthly_fee")}</p>
          <p className="text-xl font-bold">{fmt(Number(student.monthlyFee))}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("payments.finance_summary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("payments.monthly_fee")}</p>
              <p className="text-lg font-bold">{fmt(Number(student.monthlyFee))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("payments.total_paid")}</p>
              <p className="text-lg font-bold text-green-600">{fmt(totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("payments.total_due")}</p>
              <p className="text-lg font-bold">{fmt(totalDue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("payments.current_debt")}</p>
              <p className={`text-lg font-bold ${currentDebt > 0 ? "text-destructive" : "text-green-600"}`}>
                {fmt(currentDebt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("payments.advance")}</p>
              <p className="text-lg font-bold text-blue-600">{fmt(Number((student as any).advanceBalance || 0))}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("students.group_label")}</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("students.no_groups_enrolled")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                    {g.name}
{g.sessionsIncluded != null && g.sessionsIncluded > 0 && (() => {
                        const d = sessionCounterDisplay(g.sessionsIncluded, g.consumedSessions, g.paidSessions);
                        if (d.state === "hidden") return null;
                        if (d.state === "none") {
                          return (
                            <span className="mr-1.5 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t("students.consumed_sessions_none")}
                            </span>
                          );
                        }
                        return (
                          <span
                            className={
                              d.exhausted
                                ? "mr-1.5 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                                : "mr-1.5 inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
                            }
                          >
                            {d.consumed} / {d.paid}
                          </span>
                        );
                      })()}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">{t("students.payments_tab")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("students.attendance_tab")}</TabsTrigger>
          <TabsTrigger value="info">{t("students.info_tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <RecordPaymentDialog studentId={student.id} studentName={student.fullName} size="sm" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("students.consumed_sessions_label")}</CardTitle>
            </CardHeader>
            <CardContent>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("students.no_groups_enrolled")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("students.group_label")}</TableHead>
                      <TableHead>{t("students.consumed_sessions_label")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>
{(() => {
                          const d = sessionCounterDisplay(g.sessionsIncluded, g.consumedSessions, g.paidSessions);
                          if (d.state === "hidden") return <span className="text-sm text-muted-foreground">\u2014</span>;
                          if (d.state === "none") return <span className="text-sm text-muted-foreground">{t("students.consumed_sessions_none")}</span>;
                          return <Badge variant={d.exhausted ? "destructive" : "success"}>{d.consumed} / {d.paid}</Badge>;
                        })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("students.attendance_history")}</CardTitle>
            </CardHeader>
            <CardContent>
              {student.attendances.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("students.no_attendance")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("students.date_header")}</TableHead>
                      <TableHead>{t("students.group_label")}</TableHead>
                      <TableHead>{t("students.status_header")}</TableHead>
                      <TableHead>{t("payments.paid")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(student.attendances as any[]).map((a: any) => {
                      const sessionDate = a.session ? a.session.sessionDate : null;
                      const monthKey = sessionDate ? String(sessionDate).slice(0, 7) : null;
                      const gid = a.session?.groupId ?? null;
                      const paid = Boolean(
                        (gid && monthKey && paidGroupMonths.has(`${gid}:${monthKey}`))
                        || (monthKey && paidMonthsAnyGroup.has(monthKey))
                      );
                      return (
                        <TableRow key={a.id}>
                          <TableCell>{sessionDate ? formatDate(sessionDate) : "—"}</TableCell>
                          <TableCell>
                            {a.session?.groupName ? <Badge variant="secondary">{a.session.groupName}</Badge> : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[a.status]}>{t(`attendance.${a.status}`)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={paid ? "success" : "destructive"}>
                              {paid ? t("payments.paid") : t("payments.unpaid")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
              <Info label={t("students.phone_label")} value={student.phone} />
              <Info label={t("students.address")} value={student.address} />
              <Info label={t("students.notes")} value={student.notes} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "\u2014"}</p>
    </div>
  );
}
