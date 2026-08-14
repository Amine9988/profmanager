"use client";

import { useState, useEffect } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, RefreshCw, Layers } from "lucide-react";
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
  const { direction } = useI18n();
  const align = direction === "rtl" ? "right" : "left";
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

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
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
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
        <>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
              <span className="text-sm font-medium">{selectedIds.size} {t("levels.selected")}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setShowBatchEdit(true)}>
                <Pencil className="size-4" /> {t("levels.batch_edit")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
                <Trash2 className="size-4" /> {t("levels.batch_delete")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {t("common.cancel")}
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "840px" }}>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th style={{ textAlign: "center", padding: "12px" }}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={levels.length > 0 && levels.every((l) => selectedIds.has(l.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(levels.map((l) => l.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("levels.form_name")}</th>
                  <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("levels.form_cycle")}</th>
                  <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((level, i) => (
                  <LevelRow
                    key={level.id}
                    level={level}
                    onUpdated={loadLevels}
                    zebra={i % 2 === 1}
                    selected={selectedIds.has(level.id)}
                    onSelect={(checked) => {
                      const next = new Set(selectedIds);
                      if (checked) next.add(level.id);
                      else next.delete(level.id);
                      setSelectedIds(next);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showBatchEdit && (
        <BatchEditDialog
          ids={[...selectedIds]}
          onClose={() => setShowBatchEdit(false)}
          onSaved={() => { setShowBatchEdit(false); setSelectedIds(new Set()); loadLevels(); }}
        />
      )}
      {showBatchDelete && (
        <BatchDeleteDialog
          ids={[...selectedIds]}
          onClose={() => setShowBatchDelete(false)}
          onDeleted={() => { setShowBatchDelete(false); setSelectedIds(new Set()); loadLevels(); }}
        />
      )}
    </div>
  );
}

function LevelRow({ level, onUpdated, zebra, selected, onSelect }: {
  level: Level;
  onUpdated: () => void;
  zebra: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const t = useT();
  const { direction } = useI18n();
  const align = direction === "rtl" ? "right" : "left";
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      <tr className={`border-b ${zebra ? "bg-muted/20" : "bg-background"}`}>
        <td style={{ padding: "12px", textAlign: "center" }}>
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        </td>
        <td style={{ padding: "12px", textAlign: align, fontWeight: 600, fontSize: "14px", color: "hsl(var(--foreground))" }}>{level.nameAr}</td>
        <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--muted-foreground))" }}>
          {t(`levels.cycle_${level.cycle}`)}
        </td>
        <td style={{ padding: "12px", textAlign: "center" }}>
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowEdit(true)}>
              <Pencil className="size-4" />
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
  const [name, setName] = useState(level?.nameAr || "");
  const [cycle, setCycle] = useState(level?.cycle || "primary");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { nameAr: name.trim(), nameFr: name.trim(), nameEn: name.trim(), cycle };
      const url = "/api/levels";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: level.id, ...payload } : payload),
      });
      if (res.ok) {
        toast.success(isEditing ? t("levels.updated") : t("levels.created"));
        if (!isEditing) {
          setName(""); setCycle("primary");
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
            <Label>{t("levels.form_name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("levels.form_cycle")}</Label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              <option value="primary">{t("levels.cycle_primary")}</option>
              <option value="middle">{t("levels.cycle_middle")}</option>
              <option value="secondary">{t("levels.cycle_secondary")}</option>
              <option value="formation">{t("levels.cycle_formation")}</option>
              <option value="languages">{t("levels.cycle_languages")}</option>
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
            <span className="text-muted-foreground">{t("levels.form_name")}:</span>
            <span>{level.nameAr}</span>
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

function BatchEditDialog({ ids, onClose, onSaved }: {
  ids: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const updates: Record<string, unknown> = {};
    if (name.trim()) {
      updates.nameAr = name.trim();
      updates.nameFr = name.trim();
      updates.nameEn = name.trim();
    }
    if (cycle) updates.cycle = cycle;
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/levels/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, updates }),
      });
      if (res.ok) {
        toast.success(t("levels.updated"));
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("levels.batch_edit")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("levels.batch_edit_hint")}</p>
          <div className="space-y-2">
            <Label>{t("levels.form_name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("levels.form_cycle")}</Label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              <option value="">{t("levels.batch_keep")}</option>
              <option value="primary">{t("levels.cycle_primary")}</option>
              <option value="middle">{t("levels.cycle_middle")}</option>
              <option value="secondary">{t("levels.cycle_secondary")}</option>
              <option value="formation">{t("levels.cycle_formation")}</option>
              <option value="languages">{t("levels.cycle_languages")}</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchDeleteDialog({ ids, onClose, onDeleted }: {
  ids: string[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/levels/batch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
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
          <DialogTitle>{t("levels.batch_delete")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("levels.batch_delete_confirm", { count: ids.length })}</p>
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
