"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveStudent, restoreStudent, deleteStudent } from "@/server/actions/students";
import Link from "next/link";
import { StudentEditDialog } from "@/components/students/student-edit-dialog";
import { CardDialog } from "@/components/students/card-dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw, Trash2, Search, X, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { drawCardToCanvas } from "@/components/students/card-dialog";
import { jsPDF } from "jspdf";

type StudentRow = {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  schoolName: string | null;
  phone: string | null;
  fatherPhone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  monthlyFee: number;
  subscriptionStart: string | null;
  status: string;
  groupStudents: { group: { name: string } }[];
};

export function StudentsTable({ data }: { data: StudentRow[] }) {
  const { t, direction } = useI18n();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [search, setSearch] = useState("");
  const align = direction === "rtl" ? "right" : "left";

  const filtered = data.filter((s) => {
    if (filterStatus === "active" && s.status !== "active") return false;
    if (filterStatus === "archived" && s.status !== "archived") return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        s.fullName.toLowerCase().includes(q) ||
        (s.phone || "").includes(q) ||
        (s.gradeLevel || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelectedIds(
      selectedIds.length === filtered.length ? [] : filtered.map((s) => s.id)
    );
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm(t("students.bulk_delete_confirm", { count: selectedIds.length }))) return;
    const res = await fetch("/api/students/bulk-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (res.ok) {
      toast.success(t("students.bulk_delete_success", { count: selectedIds.length }));
      setSelectedIds([]);
      router.refresh();
    } else {
      toast.error(t("common.error"));
    }
  }

  async function handleBulkPrint() {
    if (!selectedIds.length) return;
    const ids = [...selectedIds];
    const data = await Promise.all(
      ids.map((id) => fetch(`/api/students/${id}/card`).then((r) => r.json()))
    );
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const perPage = 10;
    const cols = 2, rows = 5;
    const slotW = 85, slotH = 55;
    const topX = (210 - cols * slotW) / 2;
    const topY = (297 - rows * slotH) / 2;

    for (let i = 0; i < data.length; i++) {
      if (i > 0 && i % perPage === 0) pdf.addPage();
      const pageIdx = i % perPage;
      const col = pageIdx % cols;
      const row = Math.floor(pageIdx / cols);
      const sx = topX + col * slotW;
      const sy = topY + row * slotH;

      const d = data[i] as any;
      const canvas = document.createElement("canvas");
      await drawCardToCanvas(canvas, d?.student, d?.tenant, ids[i]);
      const imgData = canvas.toDataURL("image/png");
      if (imgData && imgData !== "data:,") {
        const cx = sx + (slotW - 85) / 2;
        const cy = sy + (slotH - 55) / 2;
        pdf.addImage(imgData, "PNG", cx, cy, 85, 55);
      }
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.3);
      pdf.rect(sx, sy, slotW, slotH);
    }

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) { w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 2000); }
  }

  async function handleDeleteOne(id: string) {
    if (!confirm(t("students.delete_confirm"))) return;
    const res = await deleteStudent(id);
    if (res.success) {
      toast.success(t("students.studentDeleted"));
      router.refresh();
    } else {
      toast.error(res.error ?? t("common.error"));
    }
  }

  async function handleArchive(id: string) {
    const res = await archiveStudent(id);
    if (res.success) {
      toast.success(t("students.archived_success"));
      router.refresh();
    } else {
      toast.error(res.error ?? t("common.error"));
    }
  }

  async function handleRestore(id: string) {
    const res = await restoreStudent(id);
    if (res.success) {
      toast.success("Étudiant restauré");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  }
  return (
    <div className="w-full animate-fade-in" dir={direction}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            type="text"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="inline-flex items-center rounded-lg border p-0.5 bg-muted/50">
          {(["active", "archived", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilterStatus(f); setSelectedIds([]); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                filterStatus === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "active" ? t("students.status_active") : f === "archived" ? t("students.archived") : t("common.all")}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-destructive/5 border border-destructive/20 rounded-xl animate-fade-in">
          <span className="text-sm font-medium text-destructive">
            {t("students.selected_count", { count: selectedIds.length, total: filtered.length })}
          </span>
          <Button size="sm" variant="default" onClick={handleBulkPrint}>
            <Printer className="size-3.5 mr-1" />{t("students.bulk_print")}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
            <Trash2 className="size-3.5 mr-1" />{t("students.bulk_delete")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
            <X className="size-3.5 mr-1" />{t("common.cancel")}
          </Button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "750px" }}>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleAll}
                    className="size-4 rounded border-gray-300 text-primary focus:ring-primary/50 cursor-pointer"
                  />
                </th>
                <th className={cn("px-3 py-3 text-xs font-semibold uppercase tracking-wider text-foreground text-start", align === "right" ? "text-right" : "text-left")}>
                  {t("students.form.fullName")}
                </th>
                <th className={cn("px-3 py-3 text-xs font-semibold uppercase tracking-wider text-foreground text-start", align === "right" ? "text-right" : "text-left")}>
                  {t("common.level")}
                </th>
                <th className={cn("px-3 py-3 text-xs font-semibold uppercase tracking-wider text-foreground text-start", align === "right" ? "text-right" : "text-left")}>
                  {t("common.phone")}
                </th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-foreground text-center">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Search className="size-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">{t("students.noStudents")}</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((student) => (
                <tr
                  key={student.id}
                  className={cn(
                    "border-b last:border-0 transition-colors duration-150 hover:bg-muted/40",
                    selectedIds.includes(student.id) && "bg-primary/5"
                  )}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(student.id)}
                      onChange={() => toggleOne(student.id)}
                      className="size-4 rounded border-gray-300 text-primary focus:ring-primary/50 cursor-pointer"
                    />
                  </td>
                  <td className={cn("px-3 py-3 text-sm font-medium", align === "right" ? "text-right" : "text-left")}>
                    <Link href={`/students/${student.id}`} className="hover:underline hover:text-primary transition-colors">
                      {student.fullName}
                    </Link>
                  </td>
                  <td className={cn("px-3 py-3 text-sm text-muted-foreground", align === "right" ? "text-right" : "text-left")}>
                    {student.gradeLevel || "—"}
                  </td>
                  <td className={cn("px-3 py-3 text-sm", align === "right" ? "text-right" : "text-left")} dir="ltr">
                    {student.phone || "—"}
                  </td>
                  <td className="px-3 py-3">
                    {student.status === "archived" ? (
                      <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={() => handleRestore(student.id)}>
                          <RotateCcw className="size-3.5 mr-1" />{t("students.restore")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <StudentEditDialog
                          student={{
                            id: student.id,
                            fullName: student.fullName,
                            gradeLevel: student.gradeLevel,
                            schoolName: student.schoolName,
                            phone: student.phone,
                            fatherPhone: student.fatherPhone,
                            email: student.email,
                            address: student.address,
                            notes: student.notes,
                            monthlyFee: student.monthlyFee,
                            subscriptionStart: student.subscriptionStart ? new Date(student.subscriptionStart) : null,
                          }}
                        />
                        <CardDialog studentId={student.id} />
                        <Button variant="ghost" size="sm" onClick={() => handleArchive(student.id)} title={t("common.archive")}>
                          <Archive className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteOne(student.id)} title={t("common.delete")}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cn("flex items-center justify-between py-3 text-sm text-muted-foreground", align === "right" ? "text-right" : "text-left")}>
        {selectedIds.length > 0
          ? t("students.selected_count", { count: selectedIds.length, total: filtered.length })
          : t("students.total_students", { count: filtered.length })}
      </div>
    </div>
  );
}
