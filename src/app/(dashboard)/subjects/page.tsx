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
import { BookOpen, Plus, Pencil, Trash2, Download, Search } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Subject {
  id: string;
  name: string;
  color: string;
  code: string | null;
  sessionDuration: number | null;
  status: string;
  description: string | null;
  teacherCount: number;
  studentCount: number;
  createdAt: string;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BookOpen className="size-12 mb-4 opacity-40" />
        <p className="font-medium">{t("subjects_page.empty")}</p>
        <p className="text-sm mt-1">{t("subjects_page.empty_desc")}</p>
        <Button size="sm" className="mt-4" onClick={onCreate}>
          <Plus className="size-4 mr-2" /> {t("subjects_page.new_subject")}
        </Button>
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
  const [code, setCode] = useState(subject?.code || "");
  const [color, setColor] = useState(subject?.color || "#6366f1");
  const [sessionDuration, setSessionDuration] = useState(String(subject?.sessionDuration ?? "60"));
  const [status, setStatus] = useState(subject?.status || "active");
  const [description, setDescription] = useState(subject?.description || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        color,
        sessionDuration: Number(sessionDuration) || 60,
        status,
        description: description.trim() || null,
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
      setCode("");
      setColor("#6366f1");
      setSessionDuration("60");
      setStatus("active");
      setDescription("");
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t("subjects_page.form.code")}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("subjects_page.form.code_placeholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("subjects_page.form.duration")}</Label>
              <Input type="number" min="0" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} placeholder={t("subjects_page.form.duration_placeholder")} />
            </div>
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
          <div className="space-y-2">
            <Label>{t("subjects_page.form.description")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("subjects_page.form.description_placeholder")} />
          </div>
          <div className="space-y-2">
            <Label>{t("subjects_page.form.status")}</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              <option value="active">{t("subjects_page.status_active")}</option>
              <option value="inactive">{t("subjects_page.status_inactive")}</option>
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

export default function SubjectsPage() {
  const t = useT();
  const { direction } = useI18n();
  const align = direction === "rtl" ? "right" : "left";

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  async function fetchSubjects() {
    const res = await fetch("/api/subjects");
    if (res.ok) setSubjects(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    fetchSubjects().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return subjects.filter((s) => {
      if (filterStatus === "active" && s.status !== "active") return false;
      if (filterStatus === "inactive" && s.status !== "inactive") return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          s.name.toLowerCase().includes(q) ||
          (s.code || "").toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [subjects, search, filterStatus]);

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

  function handleExport() {
    const rows = filtered.map((s) => ({
      [t("subjects_page.table.subject")]: s.name,
      [t("subjects_page.table.code")]: s.code || "—",
      [t("subjects_page.table.duration")]: s.sessionDuration ? `${s.sessionDuration} min` : "—",
      [t("subjects_page.table.teachers")]: s.teacherCount,
      [t("subjects_page.table.students")]: s.studentCount,
      [t("subjects_page.table.status")]: s.status === "active" ? t("subjects_page.status_active") : t("subjects_page.status_inactive"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("subjects_page.title"));
    XLSX.writeFile(wb, `${t("subjects_page.title")}.xlsx`);
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir={direction}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t("subjects_page.search_placeholder")}
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
                {f === "all" ? t("subjects_page.filter_all") : f === "active" ? t("subjects_page.filter_active") : t("subjects_page.filter_inactive")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4 mr-2" /> {t("subjects_page.export_button")}
            </Button>
          )}
          <SubjectFormDialog onSaved={fetchSubjects} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : subjects.length === 0 ? (
        <EmptyState onCreate={() => {}} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t("common.noResults")}</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "800px" }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/50 border-b">
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.subject")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.code")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.duration")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.teachers")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.students")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.status")}</th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("subjects_page.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
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
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {s.code || "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {s.sessionDuration ? `${s.sessionDuration} min` : "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {s.teacherCount}
                  </td>
                  <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                    {s.studentCount}
                  </td>
                  <td style={{ padding: "12px", textAlign: align }}>
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: s.status === "active" ? "rgb(220 252 231)" : "rgb(243 244 246)",
                        color: s.status === "active" ? "rgb(22 101 52)" : "rgb(107 114 128)",
                      }}
                    >
                      {s.status === "active" ? t("subjects_page.status_active") : t("subjects_page.status_inactive")}
                    </span>
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
