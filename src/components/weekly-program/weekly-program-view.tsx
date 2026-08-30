"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useT, useI18n } from "@/lib/i18n";
import type { WeeklySlot, WeeklyProgramData } from "@/server/actions/weekly-program";
import { CalendarDays, MapPin, Monitor, Users, X } from "@/lib/lucide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface Props {
  data: WeeklyProgramData;
}

export default function WeeklyProgramView({ data }: Props) {
  const t = useT();
  const { locale, direction } = useI18n();
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterTeacher, setFilterTeacher] = useState<string>("all");
  const [filterRoom, setFilterRoom] = useState<string>("all");

  const filteredSlots = useMemo(() => {
    return data.slots.filter((s) => {
      if (filterSubject !== "all" && s.group.subject?.id !== filterSubject) return false;
      if (filterTeacher !== "all" && s.group.teacher?.id !== filterTeacher) return false;
      if (filterRoom !== "all" && s.group.room?.id !== filterRoom) return false;
      return true;
    });
  }, [data.slots, filterSubject, filterTeacher, filterRoom]);

  const timeRange = { min: 8 * 60, max: 24 * 60 };
  const totalMinutes = timeRange.max - timeRange.min;
  const SLOT_HEIGHT = 48;
  const totalHeight = (totalMinutes / 30) * SLOT_HEIGHT;

  const slotsByDay = useMemo(() => {
    const byDay: Record<number, WeeklySlot[]> = {};
    for (let d = 0; d < 7; d++) byDay[d] = [];
    for (const s of filteredSlots) {
      byDay[s.dayOfWeek]?.push(s);
    }
    for (let d = 0; d < 7; d++) {
      byDay[d].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }
    return byDay;
  }, [filteredSlots]);

  function getTop(slot: WeeklySlot): number {
    return ((timeToMinutes(slot.startTime) - timeRange.min) / totalMinutes) * 100;
  }

  function getHeight(slot: WeeklySlot): number {
    return ((timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / totalMinutes) * 100;
  }

  function getOverlapGroup(slots: WeeklySlot[], index: number): { group: number; total: number } {
    const slot = slots[index];
    const sStart = timeToMinutes(slot.startTime);
    const sEnd = timeToMinutes(slot.endTime);
    let group = 0;
    let total = 0;
    for (let i = 0; i < slots.length; i++) {
      const o = slots[i];
      const oStart = timeToMinutes(o.startTime);
      const oEnd = timeToMinutes(o.endTime);
      if (oStart < sEnd && oEnd > sStart) {
        if (i < index) group++;
        total++;
      }
    }
    return { group, total };
  }

  const hasFilters = filterSubject !== "all" || filterTeacher !== "all" || filterRoom !== "all";

  const todayDayIndex = new Date().getDay();

  function getSlotCard(slot: WeeklySlot, idx: number, daySlots: WeeklySlot[]) {
    const { group, total } = getOverlapGroup(daySlots, idx);
    const width = total > 1 ? `calc((100% - 4px * ${total - 1}) / ${total})` : "calc(100% - 2px)";
    const left = total > 1 ? `calc(${(group / total) * 100}% + ${group * 4}px)` : "1px";
    const subColor = slot.group.subject?.color ?? "#6366f1";
    const bgColor = hexToRgba(subColor, 0.08);

    return (
      <Link
        key={slot.id}
        href={`/groups/${slot.group.id}`}
        className="absolute rounded-md border bg-card p-1.5 text-[10px] leading-tight shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary/30 transition-all overflow-hidden group"
        style={{
          top: `${getTop(slot)}%`,
          height: `${Math.max(getHeight(slot), 2.5)}%`,
          width,
          left,
          borderLeft: `3px solid ${subColor}`,
          background: `linear-gradient(to right, ${bgColor}, transparent 80%)`,
          zIndex: 10 + group,
        }}
        title={`${slot.group.name} (${slot.startTime} - ${slot.endTime})`}
      >
        <p className="font-semibold truncate text-[11px] group-hover:text-primary transition-colors">
          {slot.group.name}
        </p>
        {slot.group.subject && (
          <p className="truncate font-medium" style={{ color: subColor }}>
            {slot.group.subject.name}
          </p>
        )}
        {slot.group.teacher && (
          <p className="truncate text-muted-foreground mt-0.5">
            {slot.group.teacher.firstName} {slot.group.teacher.lastName}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-[9px] text-muted-foreground">
          {slot.group.room && (
            <span className="flex items-center gap-0.5">
              <MapPin className="size-2.5" />
              {slot.group.room.name}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Users className="size-2.5" />
            {slot.group.studentCount}
          </span>
        </div>
      </Link>
    );
  }

  function getMobileSlots(daySlots: WeeklySlot[]) {
    return daySlots.map((slot) => {
      const subColor = slot.group.subject?.color ?? "#6366f1";
      const bgColor = hexToRgba(subColor, 0.05);
      return (
        <Link
          key={slot.id}
          href={`/groups/${slot.group.id}`}
          className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
          style={{ borderLeft: `4px solid ${subColor}`, background: bgColor }}
        >
          <div className="shrink-0 text-center min-w-14">
            <p className="text-sm font-bold" style={{ color: subColor }}>{slot.startTime}</p>
            <p className="text-xs text-muted-foreground">{slot.endTime}</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {slot.group.subject && (
                <Badge
                  style={{ backgroundColor: hexToRgba(subColor, 0.15), color: subColor, borderColor: hexToRgba(subColor, 0.3) }}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 font-semibold"
                >
                  {slot.group.subject.name}
                </Badge>
              )}
              <p className="font-semibold text-sm truncate">{slot.group.name}</p>
            </div>
            {slot.group.teacher && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {slot.group.teacher.firstName} {slot.group.teacher.lastName}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {slot.group.room && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {slot.group.room.name}
                </span>
              )}
              {slot.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {slot.location}
                </span>
              )}
              {slot.isOnline && (
                <span className="flex items-center gap-1">
                  <Monitor className="size-3" />
                  {t("weekly_program.online")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {slot.group.studentCount}
                {slot.group.maxCapacity ? `/${slot.group.maxCapacity}` : ""}
              </span>
            </div>
          </div>
        </Link>
      );
    });
  }

  const timeSlots = Array.from({ length: totalMinutes / 30 }).map((_, i) => ({
    time: minutesToTime(timeRange.min + i * 30),
    isHour: (timeRange.min + i * 30) % 60 === 0,
  }));

  const allEmpty = DAY_KEYS.every((_, i) => slotsByDay[i].length === 0);

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="size-6 text-primary" />
          {t("weekly_program.title")}
        </h1>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSubject("all"); setFilterTeacher("all"); setFilterRoom("all"); }}>
            <X className="size-4 mr-1" />
            {t("common.reset")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger><SelectValue placeholder={t("weekly_program.all_subjects")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("weekly_program.all_subjects")}</SelectItem>
              {data.subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={filterTeacher} onValueChange={setFilterTeacher}>
            <SelectTrigger><SelectValue placeholder={t("weekly_program.all_teachers")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("weekly_program.all_teachers")}</SelectItem>
              {data.teachers.map((tch) => (
                <SelectItem key={tch.id} value={tch.id}>{tch.firstName} {tch.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={filterRoom} onValueChange={setFilterRoom}>
            <SelectTrigger><SelectValue placeholder={t("weekly_program.all_rooms")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("weekly_program.all_rooms")}</SelectItem>
              {data.rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden border-0 shadow-md">
        <div className="hidden md:block overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `80px repeat(7, 1fr)`,
              gridTemplateRows: `48px ${totalHeight}px`,
            }}
          >
            <div className="bg-muted/50 p-2 text-xs font-semibold text-muted-foreground border-b border-r flex items-center justify-center">
              {t("weekly_program.time")}
            </div>
            {DAY_KEYS.map((dk, i) => {
              const isToday = i === todayDayIndex;
              return (
                <div
                  key={dk}
                  className={`p-2 text-center text-sm font-bold border-b ${
                    isToday ? "bg-primary/5 text-primary" : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {t(`days.${dk}`)}
                  <span className={`ml-1.5 text-[10px] ${isToday ? "text-primary/60" : "text-muted-foreground/40"}`}>
                    {data.subjects.length > 0 && `(${slotsByDay[i].length})`}
                  </span>
                </div>
              );
            })}

            <div className="relative bg-card" style={{ gridColumn: "1", gridRow: "2" }}>
              {timeSlots.map((ts) => (
                <div
                  key={ts.time}
                  className={`absolute right-2 leading-none ${
                    ts.isHour ? "text-[11px] font-semibold text-muted-foreground" : "text-[9px] text-muted-foreground/50"
                  }`}
                  style={{
                    top: `${(timeSlots.indexOf(ts) * SLOT_HEIGHT / totalHeight) * 100}%`,
                    transform: "translateY(-50%)",
                  }}
                >
                  {ts.time}
                </div>
              ))}
            </div>

            {DAY_KEYS.map((dk, dayIdx) => {
              const isToday = dayIdx === todayDayIndex;
              return (
                <div
                  key={dk}
                  className={`relative border-l ${isToday ? "bg-primary/[0.02]" : "bg-card"}`}
                  style={{ gridColumn: String(dayIdx + 2), gridRow: "2" }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        to bottom,
                        transparent,
                        transparent ${(SLOT_HEIGHT / totalHeight) * 100}%,
                        hsl(var(--border)) ${(SLOT_HEIGHT / totalHeight) * 100}%,
                        hsl(var(--border)) ${(SLOT_HEIGHT / totalHeight + 0.3) * 100}%
                      )`,
                      opacity: 0.4,
                    }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        to bottom,
                        transparent,
                        transparent ${(SLOT_HEIGHT * 2 / totalHeight) * 100}%,
                        hsl(var(--border)) ${(SLOT_HEIGHT * 2 / totalHeight) * 100}%,
                        hsl(var(--border)) ${(SLOT_HEIGHT * 2 / totalHeight + 0.5) * 100}%
                      )`,
                      opacity: 0.6,
                    }}
                  />
                  {slotsByDay[dayIdx].map((slot, idx) => getSlotCard(slot, idx, slotsByDay[dayIdx]))}
                  {allEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-muted-foreground/30">{t("weekly_program.no_slots")}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:hidden divide-y">
          {DAY_KEYS.map((dk, dayIdx) => {
            const daySlots = slotsByDay[dayIdx];
            return (
              <div key={dk}>
                <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-2 flex items-center gap-2 border-b">
                  <CalendarDays className="size-4 text-primary" />
                  <span className="font-bold text-sm">{t(`days.${dk}`)}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{daySlots.length}</Badge>
                </div>
                <div className="p-3 space-y-2">
                  {daySlots.length > 0 ? getMobileSlots(daySlots) : (
                    <p className="text-xs text-muted-foreground/40 text-center py-4">{t("weekly_program.no_slots")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
