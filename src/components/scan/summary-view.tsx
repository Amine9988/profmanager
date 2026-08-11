"use client";

import { useRouter } from "next/navigation";
import { User, ClipboardCheck, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import type { BarcodeSummary } from "@/server/actions/barcode";

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
  const router = useRouter();

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
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-[11px] text-muted-foreground">الاشتراك الشهري</p>
              <p className="text-sm font-bold mt-0.5">{formatCurrency(summary.monthlyFee)}</p>
            </div>
            <div className="p-3 rounded-lg bg-success/5">
              <p className="text-[11px] text-muted-foreground">المدفوع</p>
              <p className="text-sm font-bold text-success mt-0.5">{formatCurrency(summary.totalPaid)}</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/5">
              <p className="text-[11px] text-muted-foreground">الديون</p>
              <p className="text-sm font-bold text-destructive mt-0.5">{formatCurrency(summary.currentDebt)}</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5">
              <p className="text-[11px] text-muted-foreground">السلفة</p>
              <p className="text-sm font-bold text-primary mt-0.5">{formatCurrency(summary.advanceBalance)}</p>
            </div>
          </div>

          {summary.lastPayment && (
            <div className="mt-3 p-3 rounded-lg bg-muted/30 text-sm">
              <span className="text-muted-foreground text-[11px]">آخر دفعة: </span>
              <span className="font-medium">{formatCurrency(summary.lastPayment.amountPaid)}</span>
              <span className="text-muted-foreground mx-1">|</span>
              <span className="text-muted-foreground text-[11px]">{summary.lastPayment.month}</span>
            </div>
          )}

          {summary.todaySessions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">حصة اليوم:</p>
              {summary.todaySessions.map((sess) => (
                <div key={sess.sessionId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{sess.groupName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {sess.startTime || "?"} - {sess.endTime || "?"}
                    </p>
                  </div>
                  {sess.attendanceStatus ? (
                    <Badge variant={sess.attendanceStatus === "present" ? "success" : "secondary"}>
                      {sess.attendanceStatus === "present" ? "حاضر" : sess.attendanceStatus === "late" ? "متأخر" : "مسجل"}
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
        <Button
          variant="default"
          className="flex-1 h-11"
          onClick={() => router.push(`/students/${summary.id}`)}
        >
          <ExternalLink className="size-4 ml-1" />
          فتح الملف الكامل
        </Button>
        <RecordPaymentDialog studentId={summary.id} studentName={summary.fullName} />
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
                    <p className="text-sm font-medium">{sess.group?.name || sess.group?.subjects?.name || "مجموعة"}</p>
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
                    <Badge variant={sess.attendanceStatus === "present" ? "success" : "secondary"}>
                      {sess.attendanceStatus === "present" ? "حاضر" : sess.attendanceStatus === "late" ? "متأخر" : "مسجل"}
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