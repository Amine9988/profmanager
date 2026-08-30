"use client";

import { useState } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { getAttendanceRegister } from "@/server/actions/attendance";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarCheck, CalendarX2, ChevronLeft, Users } from "@/lib/lucide";
import { cn, formatDate, initials } from "@/lib/utils";

interface RegisterGroup {
  id: string;
  name: string;
  subject?: { id?: string; name?: string } | null;
  teacher?: { id?: string; firstName?: string; lastName?: string } | null;
  studentCount: number;
}

interface RegisterSession {
  id: string;
  sessionDate: string;
  startTime?: string | null;
  endTime?: string | null;
}

type AttendanceStatus = "present" | "absent" | "late" | "excused" | "unmarked";

interface StudentRecord {
  sessionId: string;
  sessionDate: string;
  startTime?: string | null;
  status: AttendanceStatus;
}

interface RegisterEntry {
  studentId: string;
  fullName: string;
  records: StudentRecord[];
  presentCount: number;
  absentCount: number;
  markedCount: number;
  rate: number;
}

function teacherName(teacher: RegisterGroup["teacher"]): string {
  if (!teacher) return "";
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ");
}

function statusMeta(status: AttendanceStatus, t: (key: string, params?: Record<string, string | number>) => string) {
  switch (status) {
    case "present":
      return { label: t("attendance.present"), class: "bg-success/15 text-success border-success/30" };
    case "late":
      return { label: t("attendance.late"), class: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    case "absent":
      return { label: t("attendance.absent"), class: "bg-destructive/10 text-destructive border-destructive/30" };
    case "excused":
      return { label: t("attendance.excused"), class: "bg-secondary text-secondary-foreground border-secondary" };
    default:
      return { label: t("attendance.unmarked"), class: "bg-muted text-muted-foreground border-muted-foreground/30" };
  }
}

function timeRange(s: RegisterSession): string {
  if (s.startTime && s.endTime) return `${s.startTime} – ${s.endTime}`;
  if (s.startTime) return s.startTime;
  return "";
}

export function AttendanceRegister({ groups }: { groups: RegisterGroup[] }) {
  const t = useT();
  const { direction } = useI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<RegisterSession[]>([]);
  const [students, setStudents] = useState<RegisterEntry[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  async function handleSelect(groupId: string) {
    if (groupId === selectedGroupId) {
      setSelectedGroupId(null);
      setStudents([]);
      setSessions([]);
      setSelectedStudentId(null);
      return;
    }
    setSelectedGroupId(groupId);
    setSelectedStudentId(null);
    setLoading(true);
    setStudents([]);
    setSessions([]);
    try {
      const data = await getAttendanceRegister(groupId);
      setSessions(data.sessions || []);
      setStudents(data.students || []);
    } finally {
      setLoading(false);
    }
  }

  const selectedStudent = students.find((s) => s.studentId === selectedStudentId) || null;

  return (
    <div className="space-y-6" dir={direction}>
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t("attendance.selectGroup")}
        </h2>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("groups.noGroups")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => {
              const selected = selectedGroupId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => handleSelect(g.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "bg-card text-foreground hover:border-primary/50 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {g.subject?.name && (
                          <Badge variant={selected ? "outline" : "secondary"} className={selected ? "border-primary-foreground/30 text-primary-foreground" : ""}>
                            {g.subject.name}
                          </Badge>
                        )}
                        {teacherName(g.teacher) && (
                          <span className={selected ? "text-primary-foreground/80" : "text-muted-foreground"}>
                            {teacherName(g.teacher)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-1 ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      <Users className="size-3.5" />
                      {g.studentCount}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", selected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary")}>
                      {t("attendance.viewRegister")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!selectedGroupId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarCheck className="size-8 opacity-40" />
            <p className="text-sm">{t("attendance.selectRegisterHint")}</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("common.loading")}
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarX2 className="size-8 opacity-40" />
            <p className="text-sm">{t("attendance.no_students")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
            <span>
              {t("attendance.students")}: <Badge variant="secondary">{students.length}</Badge>
            </span>
            <span>
              {t("attendance.sessionsCount", { count: sessions.length })}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            {/* Student boxes */}
            <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {students.map((s) => {
                const active = selectedStudentId === s.studentId;
                return (
                  <button
                    key={s.studentId}
                    onClick={() => setSelectedStudentId(s.studentId)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "bg-card hover:border-primary/50 hover:shadow-sm"
                    )}
                  >
                    <Avatar className="size-10 shrink-0">
                      <AvatarFallback>{initials(s.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.fullName}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5 text-success">
                          <CalendarCheck className="size-3" /> {s.presentCount}
                        </span>
                        <span className="flex items-center gap-0.5 text-destructive">
                          <CalendarX2 className="size-3" /> {s.absentCount}
                        </span>
                        <span>{t("attendance.rate")}: {s.rate}%</span>
                      </div>
                    </div>
                    <ChevronLeft className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/50")} />
                  </button>
                );
              })}
            </div>

            {/* Per-session results for the selected student */}
            <div>
              {!selectedStudent ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                    <CalendarCheck className="size-8 opacity-40" />
                    <p className="text-sm">{t("attendance.selectStudentHint")}</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3 border-b pb-3">
                      <Avatar className="size-11">
                        <AvatarFallback>{initials(selectedStudent.fullName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t("attendance.studentSessions", { student: selectedStudent.fullName })}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("attendance.presentCount", { count: selectedStudent.presentCount })} ·{" "}
                          {t("attendance.absentCount", { count: selectedStudent.absentCount })} ·{" "}
                          {t("attendance.rate")}: {selectedStudent.rate}%
                        </p>
                      </div>
                      <Badge variant="outline">{selectedStudent.records.length}</Badge>
                    </div>

                    {sessions.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">{t("attendance.none")}</p>
                    ) : (
                      <ul className="divide-y">
                        {sessions.map((session) => {
                          const rec = selectedStudent.records.find((r) => r.sessionId === session.id);
                          const meta = statusMeta(rec?.status ?? "unmarked", t);
                          const time = timeRange(session);
                          return (
                            <li key={session.id} className="flex items-center justify-between gap-3 py-2.5">
                              <div className="min-w-0">
                                <p className="font-medium">{formatDate(new Date(session.sessionDate + "T00:00:00"))}</p>
                                {time && <p className="text-xs text-muted-foreground">{time}</p>}
                              </div>
                              <Badge variant="outline" className={cn("shrink-0", meta.class)}>
                                {meta.label}
                              </Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
