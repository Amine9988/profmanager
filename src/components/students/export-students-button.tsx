"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useT } from "@/lib/i18n";

type Student = {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  schoolName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  groupStudents: { group: { name: string } }[];
};

export function ExportStudentsButton({ data }: { data: Student[] }) {
  const t = useT();

  function handleExport() {
    const rows = data.map((s) => ({
      [t("students.form.fullName")]: s.fullName,
      [t("students.form.gradeLevel")]: s.gradeLevel ?? "",
      [t("students.form.schoolName")]: s.schoolName ?? "",
      [t("students.form.phone")]: s.phone ?? "",
      [t("common.email")]: s.email ?? "",
      [t("common.status")]: s.status === "active" ? t("students.status_active") : t("students.status_inactive"),
      [t("students.groups")]: s.groupStudents.map((gs) => gs.group?.name ?? "?").join(", "),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("students.title"));
    XLSX.writeFile(wb, `${t("students.title")}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="size-4 mr-2" />
      {t("students.export_button")}
    </Button>
  );
}
