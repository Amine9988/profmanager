"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check, X } from "@/lib/lucide";

interface Workspace {
  id: string;
  name: string;
}

export function WorkspaceSwitcher() {
  const t = useT();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function fetchWorkspaces() {
    const res = await fetch("/api/workspaces");
    if (res.ok) setWorkspaces(await res.json());
  }

  useEffect(() => { fetchWorkspaces(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      setNewName("");
      fetchWorkspaces();
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchWorkspaces();
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/workspaces", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) fetchWorkspaces();
  }

  return (
    <div className="px-3 py-2 border-b border-sidebar-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground/50 tracking-widest">
          {t("workspaces.title")}
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="size-4 flex items-center justify-center rounded hover:bg-sidebar-accent text-muted-foreground/50 hover:text-foreground transition-colors">
              <Plus className="size-3" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogTitle>{t("workspaces.create")}</DialogTitle>
            <div className="flex gap-2 mt-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("workspaces.name_placeholder")}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
              <Button size="sm" onClick={handleCreate}>{t("common.create")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-0.5">
        {workspaces.map((w) => (
          <div key={w.id} className="flex items-center gap-1 group">
            {editingId === w.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-6 text-xs px-1.5"
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(w.id); if (e.key === "Escape") setEditingId(null); }}
                  autoFocus
                />
                <button className="size-4 flex items-center justify-center rounded hover:bg-sidebar-accent text-green-500" onClick={() => handleRename(w.id)}>
                  <Check className="size-3" />
                </button>
                <button className="size-4 flex items-center justify-center rounded hover:bg-sidebar-accent text-muted-foreground" onClick={() => setEditingId(null)}>
                  <X className="size-3" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs text-muted-foreground/80 truncate">{w.name}</span>
                <button
                  className="size-4 flex items-center justify-center rounded hover:bg-sidebar-accent text-muted-foreground/30 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                  onClick={() => { setEditingId(w.id); setEditName(w.name); }}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  className="size-4 flex items-center justify-center rounded hover:bg-sidebar-accent text-muted-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(w.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </>
            )}
          </div>
        ))}
        {workspaces.length === 0 && (
          <p className="text-xs text-muted-foreground/60 px-2 py-1">{t("workspaces.no_workspaces")}</p>
        )}
      </div>
    </div>
  );
}
