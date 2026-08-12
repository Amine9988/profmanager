"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useT, useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CalendarCheck, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface SessionSummary {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status?: string;
  group?: {
    id: string;
    name: string;
    subject?: { name?: string } | null;
    roomId?: string | null;
  } | null;
}

interface GroupInfo {
  id: string;
  name: string;
  subject?: { id?: string; name?: string } | null;
  teacher?: { id?: string; firstName?: string; lastName?: string } | null;
  studentCount: number;
}

function teacherName(teacher: GroupInfo["teacher"]): string {
  if (!teacher) return "";
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ");
}

export function AttendanceBrowser({
  sessions,
  groups,
  roomById,
}: {
  sessions: SessionSummary[];
  groups: GroupInfo[];
  roomById: Record<string, string>;
}) {
  const t = useT();
  const { direction } = useI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const sessionCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const gid = s.group?.id;
      if (!gid) continue;
      map.set(gid, (map.get(gid) || 0) + 1);
    }
    return map;
  }, [sessions]);

  const selectedSessions = useMemo(
    () => (selectedGroupId ? sessions.filter((s) => s.group?.id === selectedGroupId) : []),
    [sessions, selectedGroupId]
  );

  const groupedByDate = useMemo(() => {
    const result: { date: string; sessions: SessionSummary[] }[] = [];
    for (const s of selectedSessions) {
      const dateStr = s.sessionDate.slice(0, 10);
      let group = result.find((g) => g.date === dateStr);
      if (!group) {
        group = { date: dateStr, sessions: [] };
        result.push(group);
      }
      group.sessions.push(s);
    }
    return result;
  }, [selectedSessions]);

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
              const count = sessionCountByGroup.get(g.id) || 0;
              const selected = selectedGroupId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(selected ? null : g.id)}
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
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        count > 0
                          ? selected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary"
                          : selected
                            ? "bg-primary-foreground/10 text-primary-foreground/70"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count > 0 ? `${count} ${t("groups.upcomingSessions")}` : t("attendance.noUpcoming")}
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
            <p className="text-sm">{t("attendance.selectGroupHint")}</p>
          </CardContent>
        </Card>
      ) : groupedByDate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarCheck className="size-8 opacity-40" />
            <p className="text-sm">{t("attendance.noUpcoming")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedByDate.map(({ date, sessions: daySessions }) => (
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
                            {s.group?.subject?.name && <Badge variant="secondary">{s.group.subject.name}</Badge>}
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
