import { notFound } from "next/navigation";
import Link from "next/link";
import { getGroup, getSubjects, getRooms } from "@/server/actions/groups";
import { getStudents } from "@/server/actions/students";
import { getAttendanceRateByGroup } from "@/server/actions/attendance";
import { ExtraSessionDialog } from "@/components/groups/extra-session-dialog";
import { EditExtraSessionDialog } from "@/components/groups/edit-extra-session-dialog";
import { DeleteExtraSessionButton } from "@/components/groups/delete-extra-session-button";
import { EnrollStudentDialog } from "@/components/groups/enroll-student-dialog";
import { GroupEditDialog } from "@/components/groups/group-edit-dialog";
import { GroupActions } from "@/components/groups/group-actions";
import { DeleteSlotButton } from "@/components/groups/delete-slot-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getInitialLocale();
  const [group, allStudents, attendanceRate, subjects, rooms, t] = await Promise.all([
    getGroup(id),
    getStudents(),
    getAttendanceRateByGroup(id),
    getSubjects(),
    getRooms(),
    getT(locale),
  ]);
  const fmt = (v: number) => formatCurrency(v);

  if (!group) notFound();
  const g = group as any;
  const roomName = rooms.find((r) => r.id === g.roomId)?.name;

  const dayNames = [
    t("days.sunday"),
    t("days.monday"),
    t("days.tuesday"),
    t("days.wednesday"),
    t("days.thursday"),
    t("days.friday"),
    t("days.saturday"),
  ];

  const enrolledIds = new Set((g.groupStudents || []).map((gs: any) => gs.studentId));
  const availableStudents = (allStudents as any[])
    .filter((s: any) => !enrolledIds.has(s.id))
    .map((s: any) => ({ id: s.id, fullName: s.fullName, gradeLevel: s.gradeLevel ?? null }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{g.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {g.subject && <Badge variant="secondary">{g.subject.name}</Badge>}
            {g.level && <span>{g.level}</span>}
            {g.pricePerSession && (
              <span className="flex items-center gap-2">
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                  g.priceType === "monthly"
                    ? "bg-blue-100 text-blue-700"
                    : g.priceType === "package"
                      ? "bg-green-100 text-green-700"
                      : "bg-purple-100 text-purple-700"
                }`}>
                  {t(`groups.${g.priceType}`)}
                </span>
                <span>{fmt(Number(g.pricePerSession))}</span>
              </span>
            )}
            {g.teacher ? (
              <span>{t("groups.teacher")}: {g.teacher.firstName} {g.teacher.lastName}</span>
            ) : (
              <span className="italic">{t("groups.teacher_none")}</span>
            )}
            {roomName && (
              <Badge variant="outline">{t("groups.room")}: {roomName}</Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GroupEditDialog
            group={{
              ...group,
              pricePerSession: g.pricePerSession ? Number(g.pricePerSession) : null,
              teacherId: g.teacher?.id ?? null,
              roomId: g.roomId ?? null,
            }}
            subjects={subjects}
            rooms={rooms}
          />
          <GroupActions groupId={g.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{t("groups.students_label")}</p>
            <p className="text-xl font-bold">
              {g.groupStudents.length}/{g.maxCapacity}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{t("groups.attendance_rate")}</p>
            <p className="text-xl font-bold">{attendanceRate.rate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("groups.schedule")}</CardTitle>
          <div className="flex items-center gap-2">
            <ExtraSessionDialog groupId={g.id} />
          </div>
        </CardHeader>
        <CardContent>
          {g.scheduleSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("groups.no_slots")}</p>
          ) : (
            <ul className="space-y-2">
              {g.scheduleSlots.map((slot: any) => (
                <li key={slot.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{dayNames[slot.dayOfWeek]}</span>
                  <span>
                    {slot.startTime} – {slot.endTime}
                  </span>
                  <span className="text-muted-foreground">{slot.location ?? "—"}</span>
                  <DeleteSlotButton slotId={slot.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("groups.detail_students")}</CardTitle>
          <EnrollStudentDialog groupId={g.id} level={g.level ?? null} availableStudents={availableStudents} />
        </CardHeader>
        <CardContent>
          {g.groupStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("groups.no_enrolled")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {g.groupStudents.map((gs) => (
                <Link key={gs.id} href={`/students/${gs.studentId}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                    {(gs.students as any)?.fullName ?? gs.studentId}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("groups.recent_sessions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {g.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("groups.no_sessions_msg")}
            </p>
          ) : (
            <ul className="space-y-2">
              {g.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <Link href={`/attendance/session/${s.id}`} className="hover:underline">
                    {formatDate(s.sessionDate)} · {s.startTime}
                  </Link>
                  <Badge variant={s.status === "completed" ? "success" : "secondary"}>
                    {s.status === "completed"
                      ? t("groups.session_completed")
                      : s.status === "cancelled"
                        ? t("groups.session_cancelled")
                        : t("groups.session_scheduled")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("groups.detail_sessions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {g.extraSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("groups.no_sessions_msg")}
            </p>
          ) : (
            <ul className="space-y-2">
              {g.extraSessions.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.type === "extra" ? "secondary" : "outline"}>
                      {s.type === "extra" ? t("groups.extra_session") : t("groups.makeup_session")}
                    </Badge>
                    <Link href={`/attendance/session/${s.id}`} className="hover:underline">
                      {formatDate(s.sessionDate)} · {s.startTime} – {s.endTime}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "completed" ? "success" : "secondary"}>
                      {s.status === "completed"
                        ? t("groups.session_completed")
                        : s.status === "cancelled"
                          ? t("groups.session_cancelled")
                          : t("groups.session_scheduled")}
                    </Badge>
                    <EditExtraSessionDialog session={s} />
                    <DeleteExtraSessionButton sessionId={s.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
