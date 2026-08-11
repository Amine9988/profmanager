"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createGroup } from "@/server/actions/groups";
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
import { Plus, Trash2, Clock, DoorOpen, Users, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { useT } from "@/lib/i18n";
import { TeacherSelect } from "@/components/shared/teacher-select";

type Subject = { id: string; name: string };
type Room = { id: string; name: string; code: string; };

const days = [
  { value: "0", key: "sunday" },
  { value: "1", key: "monday" },
  { value: "2", key: "tuesday" },
  { value: "3", key: "wednesday" },
  { value: "4", key: "thursday" },
  { value: "5", key: "friday" },
  { value: "6", key: "saturday" },
];

type SlotInput = { dayOfWeek: string; startTime: string; endTime: string };

function SlotRow({ index, slot, onChange, onRemove }: { index: number; slot: SlotInput; onChange: (i: number, s: SlotInput) => void; onRemove: (i: number) => void }) {
  const t = useT();
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{t("groups.day_of_week")}</Label>
        <Select value={slot.dayOfWeek} onValueChange={(v) => onChange(index, { ...slot, dayOfWeek: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {t(`days.${d.key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{t("groups.start_time")}</Label>
        <Input type="time" value={slot.startTime} onChange={(e) => onChange(index, { ...slot, startTime: e.target.value })} required />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{t("groups.end_time")}</Label>
        <Input type="time" value={slot.endTime} onChange={(e) => onChange(index, { ...slot, endTime: e.target.value })} required />
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onRemove(index)}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function GroupCreateDialog({ subjects, rooms }: { subjects: Subject[]; rooms?: Room[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [priceType, setPriceType] = useState("per_session");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [slots, setSlots] = useState<SlotInput[]>([{ dayOfWeek: "1", startTime: "", endTime: "" }]);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createGroup, {});

  useEffect(() => {
    if (state?.success) {
      toast.success(t("groups.created_success"));
      requestAnimationFrame(() => {
        setOpen(false);
        setSlots([{ dayOfWeek: "1", startTime: "", endTime: "" }]);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("subjectId", subjectId);
    formData.set("priceType", priceType);
    formData.set("teacherId", teacherId);
    formData.set("roomId", roomId);
    formData.set("slotCount", String(slots.length));
    slots.forEach((s, i) => {
      formData.set(`slot_day_${i}`, s.dayOfWeek);
      formData.set(`slot_start_${i}`, s.startTime);
      formData.set(`slot_end_${i}`, s.endTime);
    });
    startTransition(() => formAction(formData));
  }

  function addSlot() {
    setSlots([...slots, { dayOfWeek: "1", startTime: "", endTime: "" }]);
  }

  function updateSlot(index: number, slot: SlotInput) {
    const updated = [...slots];
    updated[index] = slot;
    setSlots(updated);
  }

  function removeSlot(index: number) {
    setSlots(slots.filter((_, i) => i !== index));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("groups.new_button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("groups.create_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("groups.name_label")}</Label>
            <Input id="name" name="name" required placeholder={t("groups.name_placeholder")} />
          </div>

          {subjects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="subjectId">{t("groups.subject_label")}</Label>
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

          <div className="space-y-2">
            <Label><GraduationCap className="size-3.5 inline mr-1" />{t("groups.teacher")}</Label>
            <TeacherSelect value={teacherId} onChange={setTeacherId} />
            <p className="text-xs text-muted-foreground">{t("groups.teacher_optional")}</p>
          </div>

          <div className="space-y-2">
            <Label><DoorOpen className="size-3.5 inline mr-1" />{t("groups.room")}</Label>
            {rooms && rooms.length > 0 ? (
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}
                className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all duration-200 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none">
                <option value="">{t("groups.room_none")}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm">
                <span className="text-xs text-muted-foreground">{t("groups.no_rooms_hint")}</span>
                <Link href="/rooms" className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {t("rooms_page.new_room")}
                </Link>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="level">{t("groups.level_label")}</Label>
              <LevelSelect name="level" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxCapacity"><Users className="size-3.5 inline mr-1" />{t("groups.capacity_label")}</Label>
              <Input id="maxCapacity" name="maxCapacity" type="number" defaultValue={10} min={1} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pricePerSession">{t("groups.price_label")}</Label>
              <Input id="pricePerSession" name="pricePerSession" type="number" step="0.01" min="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceType">{t("groups.price_type_label")}</Label>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium"><Clock className="size-3.5 inline mr-1" />{t("groups.schedule")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                <Plus className="size-3" /> {t("groups.add_slot")}
              </Button>
            </div>
            {slots.map((slot, i) => (
              <SlotRow key={i} index={i} slot={slot} onChange={updateSlot} onRemove={removeSlot} />
            ))}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("groups.creating") : t("groups.create_button")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
