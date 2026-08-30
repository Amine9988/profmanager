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
import { BookOpen, Plus, Pencil, Trash2 } from "@/lib/lucide";
import { toast } from "sonner";

interface Subject {
  id: string;
  name: string;
  color: string;
  code: string | null;
  sessionDuration: number | null;
  description: string | null;
  teacherCount: number;
  studentCount: number;
  createdAt: string;
}

function EmptyState() {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BookOpen className="size-12 mb-4 opacity-40" />
        <p className="font-medium">{t("subjects_page.empty")}</p>
        <p className="text-sm mt-1">{t("subjects_page.empty_desc")}</p>
      </CardContent>
    </Card>
  );
}

function SubjectFormDialog({
  subject,
  onClose,
  onSaved,
}: {
  subject?: Subject | null;
  onClose?: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEditing = !!subject;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(subject?.name || "");
  const [color, setColor] = useState(subject?.color || "#6366f1");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        color,
      };
      const url = "/api/subjects";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: subject.id, ...payload } : payload),
      });
      if (res.ok) {
        toast.success(isEditing ? t("subjects_page.updated") : t("subjects_page.created"));
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
      setName("");
      setColor("#6366f1");
    }
    if (!open) onClose?.();
  }

  return (
    <Dialog open={isEditing ? true : open} onOpenChange={isEditing ? undefined : handleOpenChange}>
      {!isEditing && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="size-4" /> {t("subjects_page.new_subject")}</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("subjects_page.edit_subject") : t("subjects_page.new_subject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("subjects_page.form.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("subjects_page.form.name_placeholder")} required />
          </div>
          <div className="space-y-2">
            <Label>{t("subjects_page.form.color")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-9 rounded-md border border-input cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
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

export default function SubjectsPage() {
  const t = useT();
  const { direction } = useI18n();
  const align = direction === "rtl" ? "right" : "left";

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  async function fetchSubjects() {
    const res = await fetch("/api/subjects");
    if (res.ok) setSubjects(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    fetchSubjects().finally(() => setLoading(false));
  }, []);

  async function handleDelete(subject: Subject) {
    if (!window.confirm(t("subjects_page.delete_confirm"))) return;
    try {
      const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("subjects_page.deleted"));
        fetchSubjects();
      } else {
        toast.error(t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      {/* Toolbar */}
      <div className="flex justify-end">
        <SubjectFormDialog onSaved={fetchSubjects} />
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : subjects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "800px" }}>
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/50 border-b">
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.subject")}</th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => (
                <tr key={s.id} className={`border-b ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td style={{ padding: "12px", textAlign: align, fontWeight: 600, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block size-3 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </div>
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setEditingSubject(s)}
                        title={t("common.edit")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(s)}
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
      {editingSubject && (
        <SubjectFormDialog
          subject={editingSubject}
          onClose={() => setEditingSubject(null)}
          onSaved={() => { setEditingSubject(null); fetchSubjects(); }}
        />
      )}
    </div>
  );
}
