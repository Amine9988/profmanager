"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Archive, RefreshCw, Layers } from "lucide-react";
import { toast } from "sonner";

interface Level {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  cycle: string;
  status: string;
  sortOrder: number;
}

export default function LevelsPage() {
  const t = useT();
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  async function loadLevels() {
    setLoading(true);
    setDbError(false);
    try {
      const res = await fetch("/api/levels");
      if (res.ok) {
        setLevels(await res.json());
      } else {
        const err = await res.json();
        if (err.error === "levels_table_missing") {
          setDbError(true);
        }
      }
    } catch {
      setDbError(true);
    }
    setLoading(false);
  }

  async function seedLevels() {
    try {
      const res = await fetch("/api/levels/seed", { method: "POST" });
      if (res.ok) {
        toast.success(t("levels.created"));
        loadLevels();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  useEffect(() => { loadLevels(); }, []);

  if (dbError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className="text-2xl font-bold">{t("levels.title")}</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Layers className="size-12 mb-4 opacity-40" />
            <p className="font-medium">Database table &quot;levels&quot; not found</p>
            <p className="text-sm mt-1">Run the SQL script below in your Supabase SQL editor:</p>
            <pre className="mt-4 p-4 bg-muted rounded-md text-xs max-w-xl overflow-x-auto text-left">
{`CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameFr" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  cycle TEXT NOT NULL DEFAULT 'primary',
  "sortOrder" INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("tenantId", "nameAr")
);`}
            </pre>
            <Button className="mt-4" variant="outline" size="sm" onClick={loadLevels}>
              <RefreshCw className="size-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("levels.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLevels}>
            <RefreshCw className="size-4" />
          </Button>
          <LevelFormDialog onSaved={loadLevels} />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">{t("common.loading")}</p>
      ) : levels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Layers className="size-12 mb-4 opacity-40" />
            <p className="font-medium">{t("levels.no_levels")}</p>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={seedLevels}>
                Seed default levels
              </Button>
              <LevelFormDialog onSaved={loadLevels} trigger={<Button size="sm"><Plus className="size-4 mr-2" /> {t("levels.add")}</Button>} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("levels.form_name_ar")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("levels.form_name_fr")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("levels.form_name_en")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("levels.form_cycle")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("common.status")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {levels.map((level) => (
                <LevelRow key={level.id} level={level} onUpdated={loadLevels} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LevelRow({ level, onUpdated }: { level: Level; onUpdated: () => void }) {
  const t = useT();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const archived = level.status === "archived";

  async function handleToggleArchive() {
    try {
      const res = await fetch("/api/levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id, status: archived ? "active" : "archived" }),
      });
      if (res.ok) {
        toast.success(archived ? t("levels.activated") : t("levels.archived"));
        onUpdated();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  return (
    <>
      <tr className={`hover:bg-muted/30 ${archived ? "opacity-50" : ""}`}>
        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{level.nameAr}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">{level.nameFr}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">{level.nameEn}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
          {t(`levels.cycle_${level.cycle}`)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${archived ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700"}`}>
            {archived ? t("levels.status_archived") : t("levels.status_active")}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowEdit(true)}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={handleToggleArchive}>
              <Archive className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </td>
      </tr>
      {showEdit && (
        <LevelFormDialog
          level={level}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onUpdated(); }}
        />
      )}
      {showDelete && (
        <DeleteLevelDialog
          level={level}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onUpdated(); }}
        />
      )}
    </>
  );
}

function LevelFormDialog({ level, onClose, onSaved, trigger }: {
  level?: Level | null;
  onClose?: () => void;
  onSaved: () => void;
  trigger?: React.ReactNode;
}) {
  const t = useT();
  const isEditing = !!level;
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState(level?.nameAr || "");
  const [nameFr, setNameFr] = useState(level?.nameFr || "");
  const [nameEn, setNameEn] = useState(level?.nameEn || "");
  const [cycle, setCycle] = useState(level?.cycle || "primary");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameAr.trim() || !nameFr.trim() || !nameEn.trim()) return;
    setSaving(true);
    try {
      const payload = { nameAr: nameAr.trim(), nameFr: nameFr.trim(), nameEn: nameEn.trim(), cycle };
      const url = "/api/levels";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: level.id, ...payload } : payload),
      });
      if (res.ok) {
        toast.success(isEditing ? t("levels.updated") : t("levels.created"));
        if (!isEditing) {
          setNameAr(""); setNameFr(""); setNameEn(""); setCycle("primary");
        }
        setOpen(false);
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) onClose?.();
  }

  return (
    <Dialog open={isEditing ? true : open} onOpenChange={isEditing ? undefined : handleOpenChange}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : !isEditing ? (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="size-4" /> {t("levels.add")}</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("levels.edit") : t("levels.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("levels.form_name_ar")}</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("levels.form_name_fr")}</Label>
            <Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("levels.form_name_en")}</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("levels.form_cycle")}</Label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              <option value="primary">{t("levels.cycle_primary")}</option>
              <option value="middle">{t("levels.cycle_middle")}</option>
              <option value="secondary">{t("levels.cycle_secondary")}</option>
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

function DeleteLevelDialog({ level, onClose, onDeleted }: {
  level: Level;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/levels?id=${level.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("levels.deleted"));
        onDeleted();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setDeleting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("levels.delete")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("levels.delete_confirm")}</p>
        <div className="rounded-md border p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("levels.form_name_ar")}:</span>
            <span>{level.nameAr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("levels.form_name_fr")}:</span>
            <span>{level.nameFr}</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
