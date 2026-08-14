import { getUpcomingSessions } from "@/server/actions/attendance";
import { getRooms, getGroups } from "@/server/actions/groups";
import { getT, getInitialLocale, getDirection, type Locale } from "@/lib/i18n";
import { AttendanceBrowser } from "@/components/attendance/attendance-browser";
import { AttendanceRegister } from "@/components/attendance/attendance-register";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const direction = getDirection(locale as Locale);
  const [sessions, rooms, allGroups] = await Promise.all([getUpcomingSessions(), getRooms(), getGroups()]);
  const roomById = Object.fromEntries(rooms.map((r: any) => [r.id, r.name]));

  const groups = allGroups.map((g: any) => ({
    id: g.id,
    name: g.name,
    subject: g.subject ?? null,
    teacher: g.teacher ?? null,
    studentCount: (g.groupStudents || []).length,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      <h1 className="text-2xl font-bold">{t("attendance.title")}</h1>

      <Tabs defaultValue="sessions" dir="rtl">
        <TabsList dir="rtl">
          <TabsTrigger value="sessions">{t("attendance.upcoming")}</TabsTrigger>
          <TabsTrigger value="register">{t("attendance.register")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions">
          <AttendanceBrowser
            sessions={sessions.map((s: any) => ({
              ...s,
              sessionDate: typeof s.sessionDate === "string" ? s.sessionDate.slice(0, 10) : new Date(s.sessionDate).toISOString().slice(0, 10),
            }))}
            groups={groups}
            roomById={roomById}
          />
        </TabsContent>
        <TabsContent value="register">
          <AttendanceRegister groups={groups} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
