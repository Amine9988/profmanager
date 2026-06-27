"use client";

import { useState, useEffect, useMemo } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/shared/kpi-card";
import { DoorOpen, Plus, Pencil, Trash2, Download, Search } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Room {
  id: string;
  code: string;
  name: string;
  capacity: number;
  floor: string | null;
  status: string;
  createdAt: string;
}

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
}

const DAY_NAMES_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <DoorOpen className="size-12 mb-4 opacity-40" />
        <p className="font-medium">{t("rooms_page.empty")}</p>
        <p className="text-sm mt-1">{t("rooms_page.empty_desc")}</p>
        <Button size="sm" className="mt-4" onClick={onCreate}>
          <Plus className="size-4 mr-2" /> {t("rooms_page.new_room")}
        </Button>
      </CardContent>
    </Card>
  );
}

function RoomFormDialog({
  room,
  onClose,
  onSaved,
}: {
  room?: Room | null;
  onClose?: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEditing = !!room;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(room?.code || "");
  const [name, setName] = useState(room?.name || "");
  const [capacity, setCapacity] = useState(String(room?.capacity || ""));
  const [floor, setFloor] = useState(room?.floor || "");
  const [status, setStatus] = useState(room?.status || "active");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), capacity: Number(capacity) || 0, floor: floor.trim() || null, status };
      const url = "/api/rooms";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: room.id, ...payload } : payload),
      });
      if (res.ok) {
        toast.success(isEditing ? t("rooms_page.updated") : t("rooms_page.created"));
        setOpen(false);
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(open: boolean) {
    setOpen(open);
    if (!open && !isEditing) {
      setCode("");
      setName("");
      setCapacity("");
      setFloor("");
      setStatus("active");
    }
    if (!open) onClose?.();
  }

  return (
    <Dialog open={isEditing ? true : open} onOpenChange={isEditing ? undefined : handleOpenChange}>
      {!isEditing && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="size-4" /> {t("rooms_page.new_room")}</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("rooms_page.edit_room") : t("rooms_page.new_room")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("rooms_page.form.code")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("rooms_page.form.code_placeholder")} required />
          </div>
          <div className="space-y-2">
            <Label>{t("rooms_page.form.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rooms_page.form.name_placeholder")} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t("rooms_page.form.capacity")}</Label>
              <Input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={t("rooms_page.form.capacity_placeholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("rooms_page.form.floor")}</Label>
              <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={t("rooms_page.form.floor_placeholder")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("rooms_page.form.status")}</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              <option value="active">{t("rooms_page.status_active")}</option>
              <option value="inactive">{t("rooms_page.status_inactive")}</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { if (isEditing) onClose?.(); else setOpen(false); }}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RoomsPage() {
  const t = useT();
  const { direction, locale } = useI18n();
  const align = direction === "rtl" ? "right" : "left";

  const [rooms, setRooms] = useState<Room[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  async function fetchRooms() {
    const res = await fetch("/api/rooms");
    if (res.ok) setRooms(await res.json());
  }

  async function fetchScheduleSlots() {
    try {
      const res = await fetch("/api/groups?schedule=true");
      if (res.ok) {
        const data = await res.json();
        const allSlots: ScheduleSlot[] = [];
        for (const group of data) {
          if (group.scheduleSlots) {
            allSlots.push(...group.scheduleSlots.map((s: any) => ({ ...s, location: s.location || "" })));
          }
        }
        setSlots(allSlots);
      }
    } catch {}
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRooms(), fetchScheduleSlots()]).finally(() => setLoading(false));
  }, []);

  const total = rooms.length;
  const activeCount = rooms.filter((r) => r.status === "active").length;

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (filterStatus === "active" && r.status !== "active") return false;
      if (filterStatus === "inactive" && r.status !== "inactive") return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.floor || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rooms, search, filterStatus]);

  function getRoomSchedule(roomId: string, roomName: string): string {
    const matchingSlots = slots.filter((s) => s.location === roomName);
    if (matchingSlots.length === 0) return t("rooms_page.no_schedule");
    const dayNames = locale === "ar" ? DAY_NAMES_AR : locale === "en" ? DAY_NAMES_EN : DAY_NAMES_FR;
    return matchingSlots
      .slice(0, 3)
      .map((s) => `${dayNames[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
      .join(", ");
  }

  function getScheduleTooltip(roomName: string): string {
    const matchingSlots = slots.filter((s) => s.location === roomName);
    if (matchingSlots.length === 0) return "";
    const dayNames = locale === "ar" ? DAY_NAMES_AR : locale === "en" ? DAY_NAMES_EN : DAY_NAMES_FR;
    return matchingSlots
      .map((s) => `${dayNames[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
      .join("\n");
  }

  async function handleDelete(room: Room) {
    if (!window.confirm(t("rooms_page.delete_confirm"))) return;
    try {
      const res = await fetch(`/api/rooms?id=${room.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("rooms_page.deleted"));
        fetchRooms();
      } else {
        toast.error(t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  function handleExport() {
    const dayNames = locale === "ar" ? DAY_NAMES_AR : locale === "en" ? DAY_NAMES_EN : DAY_NAMES_FR;
    const rows = filtered.map((r) => {
      const matchingSlots = slots.filter((s) => s.location === r.name);
      const schedule = matchingSlots.map((s) => `${dayNames[s.dayOfWeek]} ${s.startTime}–${s.endTime}`).join(", ");
      return {
        [t("rooms_page.code")]: r.code,
        [t("rooms_page.name")]: r.name,
        [t("rooms_page.capacity")]: r.capacity,
        [t("rooms_page.floor")]: r.floor || "",
        [t("rooms_page.schedule")]: schedule,
        [t("common.status")]: r.status === "active" ? t("rooms_page.status_active") : t("rooms_page.status_inactive"),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("rooms_page.title"));
    XLSX.writeFile(wb, `${t("rooms_page.title")}.xlsx`);
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label={t("rooms_page.total_rooms")} value={total} icon={DoorOpen} />
        <KpiCard label={t("rooms_page.active_rooms")} value={activeCount} icon={DoorOpen} tone="success" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t("rooms_page.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex rounded-md border overflow-hidden">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterStatus === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {f === "all" ? t("rooms_page.filter_all") : f === "active" ? t("rooms_page.filter_active") : t("rooms_page.filter_inactive")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4 mr-2" /> {t("rooms_page.export_button")}
            </Button>
          )}
          <RoomFormDialog onSaved={fetchRooms} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : rooms.length === 0 ? (
        <EmptyState onCreate={() => {}} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t("common.noResults")}</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "800px" }}>
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/50 border-b">
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("rooms_page.code")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("rooms_page.name")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("rooms_page.capacity")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("rooms_page.floor")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("rooms_page.schedule")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("common.status")}</th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((room, i) => (
                <tr key={room.id} className={`border-b ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td style={{ padding: "12px", textAlign: align, fontWeight: 600, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {room.code}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {room.name}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {room.capacity}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>
                    {room.floor || "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
                    <span title={getScheduleTooltip(room.name)} className="cursor-default">
                      {getRoomSchedule(room.id, room.name)}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: align }}>
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: room.status === "active" ? "rgb(220 252 231)" : "rgb(243 244 246)",
                        color: room.status === "active" ? "rgb(22 101 52)" : "rgb(107 114 128)",
                      }}
                    >
                      {room.status === "active" ? t("rooms_page.status_active") : t("rooms_page.status_inactive")}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setEditingRoom(room)}
                        title={t("common.edit")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(room)}
                        title={t("common.delete")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      {editingRoom && (
        <RoomFormDialog
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onSaved={() => { setEditingRoom(null); fetchRooms(); }}
        />
      )}
    </div>
  );
}
