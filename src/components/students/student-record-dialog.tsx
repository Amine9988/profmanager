"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, GraduationCap, School, Phone, Users, CreditCard, CalendarX2, MessageSquare } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { formatCurrency, initials, sessionCounterDisplay } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type RecordData = {
  student: {
    id: string;
    fullName: string;
    gradeLevel: string | null;
    schoolName: string | null;
    phone: string | null;
    fatherPhone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    monthlyFee: number;
    subscriptionStart: string | null;
    status: string;
    advanceBalance: number;
  };
  groupStudents: {
    id: string;
    sessionsIncluded: number | null;
    consumedSessions: number;
    paidSessions: number;
    group: { id: string; name: string; pricePerSession: number; color: string | null } | null;
    subject: { id: string; name: string; color: string | null } | null;
  }[];
  payments: {
    id: string;
    month: string;
    groupId: string | null;
    groupName: string | null;
    amountDue: number;
    amountPaid: number;
    status: string;
    paidAt: string | null;
    receiptNumber: string | null;
    note: string | null;
  }[];
  attendances: {
    id: string;
    status: string;
    sessionStatus: string | null;
    markedAt: string | null;
    sessionDate: string | null;
    startTime: string | null;
    endTime: string | null;
    groupName: string | null;
    groupColor: string | null;
    paid: boolean;
  }[];
  stats: {
    totalDue: number;
    totalPaid: number;
    totalRemaining: number;
    presentCount: number;
    absentCount: number;
    excusedCount: number;
    attendanceRate: number;
    totalSessions: number;
  };
};

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  present: "success",
  late: "warning",
  absent: "destructive",
  excused: "secondary",
  paid: "success",
  overdue: "destructive",
  pending: "warning",
  partial: "secondary",
};

export function StudentRecordDialog({ studentId, trigger }: { studentId: string; trigger?: React.ReactNode }) {
  const t = useT();
  const { direction } = useI18n();
  const [data, setData] = useState<RecordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/students/${studentId}/record`)
      .then((r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); setLoadError(true); });
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setLoadError(false);
        if (!data) setLoading(true);
      }
    }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" title={t("students.student_record")}>
            <FileText className="size-3.5 text-primary" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto" dir={direction}>
        <DialogTitle className="sr-only">{t("students.student_record")}</DialogTitle>

        {loading || !data ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center h-[300px]">
            <p className="text-sm text-muted-foreground">{t("common.error")}</p>
          </div>
        ) : (
          <RecordContent data={data} t={t} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordContent({ data, t }: { data: RecordData; t: (key: string) => string }) {
  const s = data.student;
  const st = data.stats;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">{initials(s.fullName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{s.fullName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {s.gradeLevel && (
              <span className="flex items-center gap-1">
                <GraduationCap className="size-3.5" /> {s.gradeLevel}
              </span>
            )}
            {s.schoolName && (
              <span className="flex items-center gap-1">
                <School className="size-3.5" /> {s.schoolName}
              </span>
            )}
            <Badge variant={s.status === "active" ? "success" : "secondary"}>
              {s.status === "active" ? t("students.status_active") : t("students.archived")}
            </Badge>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoCard icon={<Phone className="size-4" />} label={t("students.phone_label")} value={s.phone} dir="ltr" />
        <InfoCard icon={<Phone className="size-4" />} label={t("students.father_phone_label")} value={s.fatherPhone} dir="ltr" />
      </section>

      {/* Financial summary */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <CreditCard className="size-4" /> {t("payments.finance_summary")}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBox label={t("payments.total_paid")} value={formatCurrency(st.totalPaid)} className="text-green-600" />
          <StatBox label={t("payments.total_due")} value={formatCurrency(st.totalDue)} />
          <StatBox
            label={t("payments.current_debt")}
            value={formatCurrency(st.totalRemaining)}
            className="text-destructive"
          />
        </div>
      </section>

      {/* Groups */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Users className="size-4" /> {t("students.group_label")}
        </h3>
        {data.groupStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("students.no_groups_enrolled")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.groupStudents.map((gs) => (
              <Badge key={gs.id} variant="secondary" className="gap-1.5 py-1">
                <span className="size-2 rounded-full" style={{ background: gs.group?.color || gs.subject?.color || "#888" }} />
                {gs.group?.name ?? "?"}
{(() => {
                  const d = sessionCounterDisplay(gs.sessionsIncluded, gs.consumedSessions, gs.paidSessions);
                  if (d.state === "hidden") return null;
                  if (d.state === "none") {
                    return (
                      <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t("students.consumed_sessions_none")}
                      </span>
                    );
                  }
                  return (
                    <span
                      className={
                        d.exhausted
                          ? "inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                          : "inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
                      }
                    >
                      {d.consumed} / {d.paid}
                    </span>
                  );
                })()}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Attendance summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label={t("students.total_sessions")}
          value={String(st.totalSessions)}
        />
        <StatBox label={t("attendance.present")} value={String(st.presentCount)} className="text-green-600" />
        <StatBox label={t("attendance.absent")} value={String(st.absentCount)} className="text-destructive" />
      </section>

      {/* Remaining sessions */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <CalendarX2 className="size-4" /> {t("students.consumed_sessions_label")}
        </h3>
        {data.groupStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("students.no_groups_enrolled")}</p>
        ) : (
          <div className="max-h-44 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("students.group_label")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("students.consumed_sessions_label")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.groupStudents.map((gs) => (
                  <tr key={gs.id}>
                    <td className="px-3 py-2 font-medium">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: gs.group?.color || gs.subject?.color || "#888" }} />
                      {gs.group?.name ?? "?"}
                    </td>
                    <td className="px-3 py-2">
{(() => {
                      const d = sessionCounterDisplay(gs.sessionsIncluded, gs.consumedSessions, gs.paidSessions);
                      if (d.state === "hidden") return <span className="text-sm text-muted-foreground">—</span>;
                      if (d.state === "none") return <span className="text-sm text-muted-foreground">{t("students.consumed_sessions_none")}</span>;
                      return (
                        <Badge variant={d.exhausted ? "destructive" : "success"}>
                          {d.consumed} / {d.paid}
                        </Badge>
                      );
                    })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notes */}
      {s.notes && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="size-4" /> {t("students.notes")}
          </h3>
          <p className="rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-wrap">{s.notes}</p>
        </section>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, dir }: { icon: React.ReactNode; label: string; value: string | null | undefined; dir?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border p-3">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate" dir={dir}>{value ?? "—"}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", className)}>{value}</p>
    </div>
  );
}