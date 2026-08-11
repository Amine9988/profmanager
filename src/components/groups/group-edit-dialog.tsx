"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateGroup } from "@/server/actions/groups";
import type { ActionResult } from "@/server/actions/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { useT } from "@/lib/i18n";
import { TeacherSelect } from "@/components/shared/teacher-select";

type Subject = { id: string; name: string };
type Room = { id: string; name: string; code: string };

type GroupData = {
  id: string;
  name: string;
  subjectId: string | null;
  level: string | null;
  maxCapacity: number;
  pricePerSession: string | number | null;
  priceType: string;
  teacherId: string | null;
  roomId: string | null;
};

export function GroupEditDialog({ group, subjects, rooms }: { group: GroupData; subjects: Subject[]; rooms?: Room[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState<string>(group.subjectId ?? "");
  const [priceType, setPriceType] = useState(group.priceType);
  const [teacherId, setTeacherId] = useState<string>(group.teacherId ?? "");
  const [roomId, setRoomId] = useState<string>(group.roomId ?? "");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(updateGroup, {});

  useEffect(() => {
    if (state?.success) {
      toast.success(t("groups.updated_success"));
      requestAnimationFrame(() => {
        setOpen(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> {t("common.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.edit_title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="roomId" value={roomId} />

          <div className="space-y-2">
            <Label htmlFor="name">{t("groups.name_label")}</Label>
            <Input id="name" name="name" required defaultValue={group.name} />
          </div>

          <div className="space-y-2">
            <Label>{t("groups.teacher")}</Label>
            <TeacherSelect value={teacherId} onChange={setTeacherId} />
          </div>

          <div className="space-y-2">
            <Label>{t("groups.room")}</Label>
            {rooms && rooms.length > 0 ? (
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
                <option value="">{t("groups.room_none")}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm">
                <span className="text-xs text-muted-foreground">{t("groups.no_rooms_hint")}</span>
                <Link href="/rooms" className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {t("rooms_page.new_room")}
                </Link>
              </div>
            )}
          </div>

          {subjects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="subjectId">{t("groups.subject_label")}</Label>
              <input type="hidden" name="subjectId" value={subjectId} />
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="w-full" id="subjectId">
                  <SelectValue placeholder={t("groups.subject_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="level">{t("groups.level_label")}</Label>
              <LevelSelect name="level" defaultValue={group.level ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxCapacity">{t("groups.capacity_label")}</Label>
              <Input id="maxCapacity" name="maxCapacity" type="number" defaultValue={group.maxCapacity} min={1} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pricePerSession">{t("groups.price_label")}</Label>
              <Input
                id="pricePerSession"
                name="pricePerSession"
                type="number"
                step="0.01"
                min="0"
                defaultValue={group.pricePerSession ? String(group.pricePerSession) : ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceType">{t("groups.price_type_label")}</Label>
              <input type="hidden" name="priceType" value={priceType} />
              <Select value={priceType} onValueChange={setPriceType}>
                <SelectTrigger className="w-full" id="priceType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_session">{t("groups.per_session")}</SelectItem>
                  <SelectItem value="monthly">{t("groups.monthly")}</SelectItem>
                  <SelectItem value="package">{t("groups.package")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("groups.saving") : t("groups.save_changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
