"use client";

import { useRouter } from "next/navigation";
import { GroupEditDialog } from "@/components/groups/group-edit-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Users, Clock, Tag } from "lucide-react";
import { deleteGroup } from "@/server/actions/groups";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

type Subject = { id: string; name: string };

type GroupCardProps = {
  group: {
    id: string;
    name: string;
    status: string;
    subject: { name: string; color: string } | null;
    teacher: { id: string; firstName: string; lastName: string } | null;
    groupStudents: unknown[];
    maxCapacity: number;
    pricePerSession: number | null;
    scheduleSlots: unknown[];
    level: string | null;
    subjectId: string | null;
    priceType: string;
    roomId: string | null;
    sessionsIncluded: string | number | null;
    color?: string | null;
    expiresAt?: string | null;
  };
  subjects: Subject[];
  rooms?: { id: string; name: string; code: string }[];
};

const priceTypeStyles: Record<string, string> = {
  per_session: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  monthly: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  package: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

export function GroupCard({ group, subjects, rooms }: GroupCardProps) {
  const t = useT();
  const router = useRouter();
  const roomName = rooms?.find((r) => r.id === group.roomId)?.name;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const confirmed = window.confirm(t("groups.delete_warning"));
    if (!confirmed) return;
    deleteGroup(group.id).then((res) => {
      if (res.success) {
        toast.success(t("groups.deleted_success"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <div
      className="cursor-pointer group"
      onClick={() => router.push(`/groups/${group.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/groups/${group.id}`); }}
    >
      <Card className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{group.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <GroupEditDialog
                group={{
                  id: group.id,
                  name: group.name,
                  subjectId: group.subjectId,
                  level: group.level,
                  maxCapacity: group.maxCapacity,
                  pricePerSession: group.pricePerSession,
                  priceType: group.priceType,
                  sessionsIncluded: group.sessionsIncluded,
                  teacherId: group.teacher?.id ?? null,
                  roomId: group.roomId ?? null,
                  color: group.color ?? null,
                  expiresAt: (group as any).expiresAt ?? null,
                  scheduleSlots: (group.scheduleSlots ?? []) as { id?: string; dayOfWeek: number; startTime: string; endTime: string }[],
                }}
                subjects={subjects}
                rooms={rooms}
              />
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
          {group.subject && (
            <span
              className="inline-block w-fit rounded-md px-2.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: group.color || group.subject.color }}
            >
              <Tag className="size-3 inline mr-1" />{group.subject.name}
            </span>
          )}
          <div className="space-y-0.5">
            {group.teacher ? (
              <span className="inline-block text-xs text-muted-foreground">
                <Users className="size-3 inline mr-1" />{group.teacher.firstName} {group.teacher.lastName}
              </span>
            ) : (
              <span className="inline-block text-xs text-muted-foreground italic">
                {t("groups.teacher_none")}
              </span>
            )}
            {roomName && (
              <span className="block text-xs text-muted-foreground">
                <Tag className="size-3 inline mr-1" />{roomName}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {t("groups.students_count", { count: group.groupStudents.length, max: group.maxCapacity })}
          </p>
          {group.pricePerSession && (
            <p className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${priceTypeStyles[group.priceType] || priceTypeStyles.per_session}`}>
                {t(`groups.${group.priceType}`)}
              </span>
              <span className="tabular-nums">{formatCurrency(Number(group.pricePerSession))}</span>
              {Number(group.sessionsIncluded) > 0 && (
                <span className="tabular-nums text-xs text-muted-foreground">
                  · {group.sessionsIncluded} {t("groups.sessions_short")}
                </span>
              )}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {t("groups.slots_count", { count: group.scheduleSlots.length })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
