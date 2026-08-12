"use client";

import { useOptimistic, useTransition } from "react";
import { markAttendance, markAllPresent } from "@/server/actions/attendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, X, Clock, CheckCheck } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

type RosterEntry = {
  student: { id: string; fullName: string };
  attendance: { status: string } | null;
};

export function AttendanceMarker({
  sessionId,
  roster,
}: {
  sessionId: string;
  roster: RosterEntry[];
}) {
  const t = useT();
  const { direction } = useI18n();
  const [optimisticRoster, setOptimisticRoster] = useOptimistic(
    roster,
    (state, update: { studentId: string; status: AttendanceStatus }) =>
      state.map((r) =>
        r.student.id === update.studentId
          ? { ...r, attendance: { status: update.status } }
          : r
      )
  );
  const [, startTransition] = useTransition();

  const statusConfig: Record<
    AttendanceStatus,
    { label: string; icon: typeof Check; activeClass: string }
  > = {
    present: { label: t("attendance.present"), icon: Check, activeClass: "bg-success text-success-foreground" },
    absent: { label: t("attendance.absent"), icon: X, activeClass: "bg-destructive text-white" },
    late: { label: t("attendance.late"), icon: Clock, activeClass: "bg-warning text-warning-foreground" },
    excused: { label: t("attendance.excused"), icon: Check, activeClass: "bg-secondary text-secondary-foreground" },
  };

  function handleMark(studentId: string, status: AttendanceStatus) {
    startTransition(async () => {
      setOptimisticRoster({ studentId, status });
      const res = await markAttendance(sessionId, studentId, status);
      if (!res.success) {
        toast.error(res.error ?? t("common.marking_error"));
      }
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      for (const r of optimisticRoster) {
        setOptimisticRoster({ studentId: r.student.id, status: "present" });
      }
      const res = await markAllPresent(sessionId);
      if (res.success) {
        toast.success(t("attendance.marked_all"));
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  if (optimisticRoster.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground" dir={direction}>
        {t("attendance.no_students")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="attendance-marker" dir={direction}>
      <Button onClick={handleMarkAll} variant="outline" className="w-full" size="lg">
        <CheckCheck className="size-5" /> {t("attendance.mark_all")}
      </Button>

      <div className="space-y-2">
        {optimisticRoster.map((entry) => {
          const currentStatus = (entry.attendance?.status as AttendanceStatus) ?? null;

          return (
            <Card key={entry.student.id} data-testid="attendance-row">
              <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback>{initials(entry.student.fullName)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{entry.student.fullName}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["present", "absent", "late"] as AttendanceStatus[]).map((status) => {
                    const config = statusConfig[status];
                    const Icon = config.icon;
                    const isActive = currentStatus === status;

                    return (
                      <button
                        key={status}
                        type="button"
                        data-testid={`status-${status}`}
                        aria-pressed={isActive}
                        onClick={() => handleMark(entry.student.id, status)}
                        className={cn(
                          "flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors active:scale-95",
                          isActive ? config.activeClass : "bg-background hover:bg-accent"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="hidden sm:inline">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
