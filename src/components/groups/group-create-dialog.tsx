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
import { Plus, DoorOpen, Users, GraduationCap, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { useT } from "@/lib/i18n";
import { TeacherSelect } from "@/components/shared/teacher-select";
import { normalizeTime } from "@/lib/group-form";

type Subject = { id: string; name: string; color?: string | null };
type Room = { id: string; name: string; code: string; };

export const GROUP_COLOR_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#d97706", "#14b8a6", "#a855f7",
];

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {GROUP_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${value === c ? "border-foreground scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-input px-2 py-1 text-xs text-muted-foreground">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-4 rounded border-0 bg-transparent p-0" />
          {value}
        </label>
      </div>
    </div>
  );
}

export function GroupCreateDialog({ subjects, rooms }: { subjects: Subject[]; rooms?: Room[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const [color, setColor] = useState<string>(selectedSubject?.color || GROUP_COLOR_PALETTE[0]);
  const [slots, setSlots] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([]);
  const [useExpiresAt, setUseExpiresAt] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const dayNames = t("groups.dayNames").split("|");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createGroup, {});

  useEffect(() => {
    if (state?.success) {
      toast.success(t("groups.created_success"));
      requestAnimationFrame(() => {
        setOpen(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  useEffect(() => {
    if (open) {
      const s = subjects.find((x) => x.id === subjectId);
      if (s?.color) setColor(s.color);
    }
  }, [open, subjectId, subjects]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Ensure controlled selects that have no native name still submit correctly
    // (TeacherSelect / room / subject are state-driven)
    formData.set("subjectId", subjectId || "");
    formData.set("teacherId", teacherId || "");
    formData.set("roomId", roomId || "");
    // Checkbox and date: keep both keys for robustness (expiresAt + legacy expiresAtField)
    formData.set("useExpiresAt", useExpiresAt ? "1" : "0");
    const cleanExpires = useExpiresAt ? (expiresAt || "").trim() : "";
    formData.set("expiresAt", cleanExpires);
    formData.set("expiresAtField", cleanExpires);
    formData.set("slotCount", String(slots.length));
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const st = normalizeTime(s.startTime) || String(s.startTime || "").trim();
      const et = normalizeTime(s.endTime) || String(s.endTime || "").trim();
      formData.set(`slot_day_${i}`, String(s.dayOfWeek));
      formData.set(`slot_start_${i}`, st);
      formData.set(`slot_end_${i}`, et);
    }
    startTransition(() => formAction(formData));
  }

  function addSlot() {
    setSlots((prev) => [...prev, { dayOfWeek: 0, startTime: "16:00", endTime: "18:00" }]);
  }

  function updateSlot(i: number, patch: Partial<{ dayOfWeek: number; startTime: string; endTime: string }>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function removeSlot(i: number) {
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
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
              <select
                id="subjectId"
                name="subjectId"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]"
              >
                <option value="">{t("groups.subject_placeholder")}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input type="hidden" name="subjectId" value={subjectId} />
            </div>
          )}

          <div className="space-y-2">
            <Label><GraduationCap className="size-3.5 inline mr-1" />{t("groups.teacher")}</Label>
            <TeacherSelect value={teacherId} onChange={setTeacherId} />
            <input type="hidden" name="teacherId" value={teacherId} />
            <p className="text-xs text-muted-foreground">{t("groups.teacher_optional")}</p>
          </div>

          <div className="space-y-2">
            <Label><DoorOpen className="size-3.5 inline mr-1" />{t("groups.room")}</Label>
            {rooms && rooms.length > 0 ? (
              <>
                <select
                  id="roomId"
                  name="roomId"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all duration-200 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none">
                  <option value="">{t("groups.room_none")}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                  ))}
                </select>
                <input type="hidden" name="roomId" value={roomId} />
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm">
                <span className="text-xs text-muted-foreground">{t("groups.no_rooms_hint")}</span>
                <Link href="/rooms" className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {t("rooms_page.new_room")}
                </Link>
              </div>
            )}
          </div>

          <input type="hidden" name="slotCount" value={slots.length} />
          <div className="space-y-2">
            <Label><CalendarClock className="size-3.5 inline mr-1" />{t("groups.schedule")}</Label>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{t("groups.no_slots")}</span>
              <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                <Plus className="size-3.5" /> {t("groups.add_slot")}
              </Button>
            </div>
            {slots.length > 0 && (
              <div className="space-y-2 pt-1">
                {slots.map((slot, i) => (
                  <div key={i} className="rounded-lg border border-input p-2.5 space-y-2">
                    <div className="grid grid-cols-3 items-end gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("groups.day")}</Label>
                        <select
                          value={slot.dayOfWeek}
                          onChange={(e) => updateSlot(i, { dayOfWeek: parseInt(e.target.value, 10) })}
                          name={`slot_day_${i}`}
                          className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]"
                        >
                          {dayNames.map((d, di) => (
                            <option key={di} value={di}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`slot_start_${i}`} className="text-xs">{t("groups.startTime")}</Label>
                        <Input
                          id={`slot_start_${i}`}
                          type="time"
                          name={`slot_start_${i}`}
                          value={slot.startTime}
                          onChange={(e) => updateSlot(i, { startTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`slot_end_${i}`} className="text-xs">{t("groups.endTime")}</Label>
                        <Input
                          id={`slot_end_${i}`}
                          type="time"
                          name={`slot_end_${i}`}
                          value={slot.endTime}
                          onChange={(e) => updateSlot(i, { endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeSlot(i)}>
                        <X className="size-4" /> {t("common.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
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

          <input type="hidden" name="priceType" value="monthly" />
          <div className="space-y-2">
            <Label htmlFor="pricePerSession">{t("groups.price_label")}</Label>
            <Input id="pricePerSession" name="pricePerSession" type="number" step="0.01" min="0" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionsIncluded">{t("groups.sessions_included_label")}</Label>
            <Input
              id="sessionsIncluded"
              name="sessionsIncluded"
              type="number"
              min="0"
              placeholder={t("groups.sessions_included_placeholder")}
            />
            <p className="text-xs text-muted-foreground">{t("groups.sessions_included_hint")}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="useExpiresAt" name="useExpiresAt" value="1" checked={useExpiresAt} onChange={(e) => setUseExpiresAt(e.target.checked)} className="size-4 rounded border-input" />
              <Label htmlFor="useExpiresAt">{t("groups.expires_label")}</Label>
            </div>
            <input type="hidden" name="useExpiresAt" value={useExpiresAt ? "1" : "0"} />
            {useExpiresAt ? (
              <>
                <Input
                  id="expiresAt"
                  name="expiresAt"
                  type="date"
                  lang="fr"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required={useExpiresAt}
                />
                <input type="hidden" name="expiresAtField" value={expiresAt} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("groups.expires_hint")}</p>
            )}
            {!useExpiresAt && <input type="hidden" name="expiresAt" value="" />}
          </div>

          <input type="hidden" name="color" value={color} />
          <ColorPicker value={color} onChange={setColor} label={t("groups.color_label")} />

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
