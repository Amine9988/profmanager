"use client";

import { useState, useEffect } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DoorOpen, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Room {
  id: string;
  name: string;
}

function EmptyState() {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <DoorOpen className="size-12 mb-4 opacity-40" />
        <p className="font-medium">{t("rooms_page.empty")}</p>
        <p className="text-sm mt-1">{t("rooms_page.empty_desc")}</p>
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
  const [name, setName] = useState(room?.name || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim() };
      const res = await fetch("/api/rooms", {
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
    if (!open && !isEditing) setName("");
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
            <Label>{t("rooms_page.form.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rooms_page.form.name_placeholder")} required />
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
  const { direction } = useI18n();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const align = direction === "rtl" ? "right" : "left";

  async function fetchRooms() {
    const res = await fetch("/api/rooms");
    if (res.ok) {
      const data = await res.json();
      setRooms((data as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })));
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchRooms().finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      <div className="flex justify-end">
        <RoomFormDialog onSaved={fetchRooms} />
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : rooms.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>
                      {t("rooms_page.name")}
                    </th>
                    <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room, i) => (
                    <tr key={room.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                      <td style={{ padding: "12px", textAlign: align, fontWeight: 600, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                        {room.name}
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
            <p style={{ textAlign: align, padding: "12px", fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>
              {t("rooms_page.total_rooms")}: {rooms.length}
            </p>
          </CardContent>
        </Card>
      )}

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