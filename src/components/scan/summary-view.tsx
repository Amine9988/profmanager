"use client";

import { User, ClipboardCheck, FileText, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { StudentRecordDialog } from "@/components/students/student-record-dialog";
import type { BarcodeSummary } from "@/server/actions/barcode";
import { sessionCounterDisplay, formatDateKey } from "@/lib/utils";

function formatCurrency(v: number) {
  return v.toLocaleString("fr-DZ") + " د.ج";
}

interface SummaryViewProps {
  summary: BarcodeSummary;
  attView: { groups: any[]; sessions: any[]; roomById: Record<string, string> } | null;
  attendanceLoading: string | null;
  onMarkAttendance: (sessionId: string) => void;
}

export function SummaryView({ summary, attView, attendanceLoading, onMarkAttendance }: SummaryViewProps) {
  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="size-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{summary.fullName}</h2>
              <p className="text-xs text-muted-foreground">{summary.gradeLevel || "بدون مستوى"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-success/5">
              <p className="text-[11px] text-muted-foreground">المدفوع</p>
              <p className="text-sm font-bold text-success mt-0.5">{formatCurrency(summary.totalPaid)}</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/5">
              <p className="text-[11px] text-muted-foreground">الديون</p>
              <p className="text-sm font-bold text-destructive mt-0.5">{formatCurrency(summary.currentDebt)}</p>
            </div>
          </div>

          {summary.groupCredits.filter((c) => c.sessionsIncluded != null && c.sessionsIncluded > 0).length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">الحصص المستهلكة:</p>
              {summary.groupCredits
                .filter((c) => c.sessionsIncluded != null && c.sessionsIncluded > 0)
                .map((c) => {
                  const d = sessionCounterDisplay(c.sessionsIncluded, c.consumedSessions, c.paidSessions);
                  return (
                    <div key={c.groupId} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color || "#888" }} />
                        {c.groupName}
                      </span>
                      {d.state === "counter" ? (
                        <span className={`text-sm font-bold ${d.exhausted ? "text-destructive" : "text-success"}`}>
                          {d.consumed} من {d.paid}
                          {d.exhausted && <span className="block text-[10px] font-normal text-destructive">انتهت الحصص — يجب الدفع</span>}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">لا توجد حصص مدفوعة</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {summary.lastPayment && (
            <div className="mt-3 p-3 rounded-lg bg-muted/30 text-sm">
              <span className="text-muted-foreground text-[11px]">آخر دفعة: </span>
              <span className="font-medium">{formatCurrency(summary.lastPayment.amountPaid)}</span>
              <span className="text-muted-foreground mx-1">|</span>
              <span className="text-muted-foreground text-[11px]">{formatDateKey(summary.lastPayment.date)}</span>
            </div>
          )}

          {summary.todaySessions.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
              <ClipboardCheck className="size-4 shrink-0" />
              لا توجد حصص اليوم
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">حصة اليوم:</p>
              {summary.todaySessions.map((sess) => (
                <div key={sess.sessionId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: sess.color || "#888" }} />
                      {sess.groupName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {sess.startTime || "?"} - {sess.endTime || "?"}
                    </p>
                  </div>
                  {sess.attendanceStatus ? (
                    <Badge variant={sess.attendanceStatus === "present" ? "success" : sess.attendanceStatus === "late" ? "warning" : sess.attendanceStatus === "absent" ? "destructive" : "secondary"}>
                      {sess.attendanceStatus === "present" ? "حاضر" : sess.attendanceStatus === "late" ? "متأخر" : sess.attendanceStatus === "absent" ? "غائب" : "مسجل"}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkAttendance(sess.sessionId)}
                      disabled={attendanceLoading === sess.sessionId}
                    >
                      <ClipboardCheck className="size-3 ml-1" />
                      {attendanceLoading === sess.sessionId ? "..." : "تسجيل حضور"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <div className="flex-1">
          <StudentRecordDialog
            studentId={summary.id}
            trigger={
              <Button variant="default" className="w-full h-11">
                <FileText className="size-4 ml-1" />
                سجل التلميذ
              </Button>
            }
          />
        </div>
        <RecordPaymentDialog
          studentId={summary.id}
          studentName={summary.fullName}
          trigger={
            <Button variant="outline" className="h-11">
              <DollarSign className="size-4 ml-1" />
              تسجيل دفعة
            </Button>
          }
        />
      </div>

      {attView && (
        <div className="pt-2">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            حضور {summary.fullName} — الحصص القادمة:
          </h2>
          {attView.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد حصص قادمة لهذا التلميذ.</p>
          ) : (
            <div className="space-y-2">
              {attView.sessions.map((sess) => (
                <div key={sess.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: sess.group?.color || sess.group?.subjects?.color || "#888" }} />
                      {sess.group?.name || sess.group?.subjects?.name || "مجموعة"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(sess.sessionDate + "T00:00:00").toLocaleDateString("ar-DZ", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      • {sess.startTime} - {sess.endTime}
                      {attView.roomById[sess.roomId] ? ` • ${attView.roomById[sess.roomId]}` : ""}
                    </p>
                  </div>
                  {sess.attendanceStatus ? (
                    <Badge variant={sess.attendanceStatus === "present" ? "success" : sess.attendanceStatus === "late" ? "warning" : sess.attendanceStatus === "absent" ? "destructive" : "secondary"}>
                      {sess.attendanceStatus === "present" ? "حاضر" : sess.attendanceStatus === "late" ? "متأخر" : sess.attendanceStatus === "absent" ? "غائب" : "مسجل"}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkAttendance(sess.id)}
                      disabled={attendanceLoading === sess.id}
                    >
                      <ClipboardCheck className="size-3 ml-1" />
                      {attendanceLoading === sess.id ? "..." : "تسجيل حضور"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}