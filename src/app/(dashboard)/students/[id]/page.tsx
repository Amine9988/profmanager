import { notFound } from "next/navigation";
import Link from "next/link";
import { getStudent } from "@/server/actions/students";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentEditDialog } from "@/components/students/student-edit-dialog";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  present: "success",
  absent: "destructive",
  late: "warning",
  excused: "secondary",
};

const paymentStatusVariant: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  paid: "success",
  overdue: "destructive",
  pending: "warning",
  partial: "secondary",
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
    .map((gs: any) => ({ id: gs.group?.id ?? "?", name: gs.group?.name ?? "?" }));

  const totalPaid = (student.payments as any[]).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0);
  const totalDue = (student.payments as any[]).reduce((sum: number, p: any) => sum + Number(p.amountDue), 0);
  const currentDebt = totalDue - totalPaid;

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
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent">{g.name}</Badge>
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
          {student.payments.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t("students.no_payments")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("payments.month")}</TableHead>
                      <TableHead>{t("payments.amount_due")}</TableHead>
                      <TableHead>{t("payments.amount_paid")}</TableHead>
                      <TableHead>{t("payments.status")}</TableHead>
                      <TableHead>{t("payments.paid_on")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(student.payments as any[]).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.month, "MMM yyyy")}</TableCell>
                        <TableCell className="font-medium">{fmt(Number(p.amountDue))}</TableCell>
                        <TableCell>{fmt(Number(p.amountPaid))}</TableCell>
                        <TableCell>
                          <Badge variant={paymentStatusVariant[p.status] || "secondary"}>
                            {t(`payments.${p.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.paidAt ? formatDate(p.paidAt) : "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
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
                      <TableHead>{t("students.status_header")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(student.attendances as any[]).map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.session ? formatDate(a.session.sessionDate) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[a.status]}>{t(`attendance.${a.status}`)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
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
              <Info label={t("students.email")} value={student.email} />
              <Info label={t("students.address")} value={student.address} />
              <Info label={t("students.dob")} value={student.dateOfBirth ? formatDate(student.dateOfBirth) : null} />
              <Info label={t("students.notes")} value={student.notes} />
              <Info label={t("payments.billing_type")} value={student.billingType === "monthly" ? t("payments.monthly") : t("groups.per_session")} />
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
