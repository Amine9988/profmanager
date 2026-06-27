import Link from "next/link";
import { getUpcomingSessions } from "@/server/actions/attendance";
import { getRooms } from "@/server/actions/groups";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CalendarCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getT, getInitialLocale } from "@/lib/i18n";
import { GenerateSessionsButton } from "@/components/shared/generate-sessions-button";

function groupByDate(sessions: Awaited<ReturnType<typeof getUpcomingSessions>>) {
  const groups: { date: string; sessions: typeof sessions }[] = [];
  for (const s of sessions) {
    const dateStr = typeof s.sessionDate === "string" ? s.sessionDate.slice(0, 10) : s.sessionDate.toISOString().slice(0, 10);
    let group = groups.find((g) => g.date === dateStr);
    if (!group) {
      group = { date: dateStr, sessions: [] };
      groups.push(group);
    }
    group.sessions.push(s);
  }
  return groups;
}

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const [sessions, rooms] = await Promise.all([getUpcomingSessions(), getRooms()]);
  const roomById = Object.fromEntries(rooms.map((r: any) => [r.id, r.name]));
  const grouped = groupByDate(sessions);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{t("attendance.title")}</h1>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarCheck className="size-10 text-muted-foreground" />
            <p className="font-medium">{t("attendance.noUpcoming")}</p>
            <p className="text-sm text-muted-foreground">
              {t("attendance.noUpcomingDesc")}
            </p>
            <GenerateSessionsButton />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ date, sessions: daySessions }) => (
            <section key={date}>
              <h2 className="mb-3 text-lg font-semibold">{formatDate(new Date(date + "T00:00:00"))}</h2>
              <div className="space-y-3">
                {daySessions.map((s) => (
                  <Link key={s.id} href={`/attendance/session/${s.id}`}>
                    <Card className="transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center justify-between py-4">
                        <div>
                          <p className="font-semibold">{s.group?.name ?? "?"}</p>
                          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            {s.group?.subject && <Badge variant="secondary">{s.group.subject.name}</Badge>}
                            {s.group?.roomId && roomById[s.group.roomId] && <Badge variant="outline">{roomById[s.group.roomId]}</Badge>}
                            <span>
                              {s.startTime} – {s.endTime}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="size-5 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
