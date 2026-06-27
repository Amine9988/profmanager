import { getGroups, getSubjects, getRooms } from "@/server/actions/groups";
import { GroupCreateDialog } from "@/components/groups/group-create-dialog";
import { GroupCard } from "@/components/groups/group-card";
import { Card, CardContent } from "@/components/ui/card";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const [groups, subjects, rooms] = await Promise.all([getGroups(), getSubjects(), getRooms()]);

  const locale = await getInitialLocale();
  const t = await getT(locale);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("groups.title")}</h1>
        <GroupCreateDialog subjects={subjects} rooms={rooms} />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="font-medium">{t("groups.no_groups")}</p>
            <p className="text-sm text-muted-foreground">
              {t("groups.no_groups_desc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={{
                  id: g.id,
                  name: g.name,
                  status: g.status,
                  subject: g.subject,
                  teacher: g.teacher ?? null,
                  groupStudents: g.groupStudents,
                  maxCapacity: g.maxCapacity,
                  pricePerSession: g.pricePerSession,
                  scheduleSlots: g.scheduleSlots,
                  level: g.level,
                  subjectId: g.subjectId,
                  priceType: g.priceType,
                  roomId: g.roomId ?? null,
                }}
                subjects={subjects}
                rooms={rooms}
              />
          ))}
        </div>
      )}
    </div>
  );
}
