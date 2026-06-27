"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { bulkImportStudents } from "@/server/actions/students";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type PreviewRow = {
  fullName: string;
  gradeLevel?: string;
  schoolName?: string;
  phone?: string;
  email?: string;
};

const FRENCH_HEADERS: Record<string, string> = {
  "nom complet": "fullName",
  "nom": "fullName",
  "fullname": "fullName",
  "niveau": "gradeLevel",
  "gradelevel": "gradeLevel",
  "Ã©cole": "schoolName",
  "ecole": "schoolName",
  "schoolname": "schoolName",
  "tÃ©lÃ©phone": "phone",
  "telephone": "phone",
  "email": "email",
};

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => FRENCH_HEADERS[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
}

function parseFile(file: File): Promise<PreviewRow[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        const headers = normalizeHeaders(result.meta.fields ?? []);
        const rows = result.data.map((row) => {
          const mapped: Record<string, string> = {};
          (result.meta.fields ?? []).forEach((orig, i) => { mapped[headers[i]] = row[orig]; });
          return mapped as unknown as PreviewRow;
        });
        resolve(rows);
      };
      reader.onerror = () => reject("file_read_error");
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        const headers = normalizeHeaders(Object.keys(json[0] ?? {}));
        const rows = json.map((row) => {
          const mapped: Record<string, string> = {};
          Object.keys(row).forEach((orig, i) => { mapped[headers[i]] = row[orig]; });
          return mapped as unknown as PreviewRow;
        });
        resolve(rows);
      };
      reader.onerror = () => reject("file_read_error");
      reader.readAsArrayBuffer(file);
    } else {
      reject("unsupported_format");
    }
  });
}

export function ImportStudentsDialog() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allRows, setAllRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseFile(file);
      setAllRows(rows);
      setResult(null);
    } catch (err) {
      const msg = err === "file_read_error" ? t("students.import_read_error") : t("students.import_unsupported");
      toast.error(msg);
    }
  };

  const handleImport = async () => {
    if (allRows.length === 0) return;
    setLoading(true);
    const res = await bulkImportStudents(allRows.map((r) => ({
      fullName: r.fullName,
      gradeLevel: r.gradeLevel,
      schoolName: r.schoolName,
      phone: r.phone,
      email: r.email,
    })));
    setResult(res);
    setLoading(false);
    if (res.imported > 0) {
      toast.success(t("students.import_success", { count: res.imported }));
      router.refresh();
    }
    if (res.errors.length > 0) {
      toast.error(t("students.import_errors", { count: res.errors.length }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setAllRows([]); setResult(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4 mr-2" />
          {t("students.import_button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("students.import_title")}</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={handleFile} className="flex-1" />
            </div>
            <p className="text-xs text-muted-foreground">{t("students.import_columns_hint")}</p>
            {allRows.length > 0 && (
              <>
                <p className="text-sm font-medium">
                  {t("students.import_preview", { shown: Math.min(10, allRows.length), total: allRows.length })}
                </p>
                <div className="max-h-60 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("students.form.fullName")}</TableHead>
                        <TableHead>{t("students.form.gradeLevel")}</TableHead>
                        <TableHead>{t("students.form.schoolName")}</TableHead>
                        <TableHead>{t("students.form.phone")}</TableHead>
                        <TableHead>{t("common.email")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.gradeLevel ?? ""}</TableCell>
                          <TableCell>{row.schoolName ?? ""}</TableCell>
                          <TableCell>{row.phone ?? ""}</TableCell>
                          <TableCell>{row.email ?? ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DialogFooter>
                  <Button onClick={handleImport} disabled={loading}>
                    {loading ? t("students.import_loading") : t("students.import_confirm", { count: allRows.length })}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-green-600">
              âœ… {t("students.import_success", { count: result.imported })}
            </p>
            {result.errors.length > 0 && (
              <div className="text-sm text-destructive">
                <p className="font-medium">âŒ {t("students.import_skipped", { count: result.skipped })}</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <Button onClick={() => { setOpen(false); setAllRows([]); setResult(null); }}>
              {t("common.close")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
