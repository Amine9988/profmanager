"use client";

import { useState } from "react";
import { createBackup } from "@/server/actions/backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function BackupRestore() {
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await createBackup();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("settings.backup_created"));
    } catch {
      toast.error(t("settings.backup_error"));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.tenantId) {
        toast.error(t("settings.backup_invalid"));
        return;
      }
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? t("settings.restore_error"));
        return;
      }
      toast.success(t("settings.restore_success"));
      window.location.reload();
    } catch {
      toast.error(t("settings.backup_invalid"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />{t("settings.backup_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("settings.backup_desc")}</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Download className="mr-1 size-4" />}
            {t("settings.export_backup")}
          </Button>
          <label>
            <Button variant="outline" disabled={importing} asChild>
              <span>
                {importing ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Upload className="mr-1 size-4" />}
                {t("settings.restore_backup")}
              </span>
            </Button>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
