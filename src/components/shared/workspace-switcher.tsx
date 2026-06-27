"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Workspace {
  id: string;
  name: string;
  isActive: boolean;
}

export function WorkspaceSwitcher() {
  const t = useT();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchWorkspaces() {
    const res = await fetch("/api/workspaces");
    if (res.ok) setWorkspaces(await res.json());
  }

  useEffect(() => { fetchWorkspaces(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setNewName("");
        fetchWorkspaces();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  async function handleActivate(id: string) {
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: true }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        fetchWorkspaces();
      }
    } catch { toast.error(t("common.error")); }
  }

  return (
    <div className="border-b border-sidebar-border px-3 py-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {t("workspaces.title")}
          </span>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-foreground">
              <Plus className="size-3" />
            </Button>
          </DialogTrigger>
        </div>
        <div className="space-y-0.5">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => handleActivate(w.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-200",
                w.isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Building2 className={cn("size-3.5 shrink-0", w.isActive && "text-primary")} />
              <span className="truncate">{w.name}</span>
              {w.isActive && <Check className="size-3 ml-auto text-primary" />}
            </button>
          ))}
          {workspaces.length === 0 && (
            <p className="text-xs text-muted-foreground/60 px-2 py-1">{t("workspaces.no_workspaces")}</p>
          )}
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspaces.create")}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder={t("workspaces.name_placeholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? t("common.saving") : t("common.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
