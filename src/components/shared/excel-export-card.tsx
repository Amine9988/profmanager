"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Wallet, GraduationCap, Users, Download, Loader2 } from "@/lib/lucide";
import { useT } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ExportType = "cash" | "teachers" | "students";

export function ExcelExportCard() {
  const t = useT();
  const [downloading, setDownloading] = useState<ExportType | null>(null);

  async function download(type: ExportType) {
    if (downloading) return;
    setDownloading(type);
    try {
      const res = await fetch(`/api/export?type=${type}`, { method: "GET" });
      if (!res.ok) throw new Error("export_failed");
      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^";]+)"?/.exec(contentDisposition);
      const filename = match ? match[1] : `${type}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("settings.export_success"));
    } catch {
      toast.error(t("settings.export_error"));
    } finally {
      setDownloading(null);
    }
  }

  const items: { type: ExportType; icon: typeof Wallet; label: string; desc: string }[] = [
    { type: "cash", icon: Wallet, label: t("settings.export_cash"), desc: t("settings.export_cash_desc") },
    { type: "teachers", icon: GraduationCap, label: t("settings.export_teachers"), desc: t("settings.export_teachers_desc") },
    { type: "students", icon: Users, label: t("settings.export_students"), desc: t("settings.export_students_desc") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.export_section")}</CardTitle>
        <CardDescription>{t("settings.export_section_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            const busy = downloading === item.type;
            return (
              <Button
                key={item.type}
                type="button"
                variant="outline"
                disabled={!!downloading}
                onClick={() => download(item.type)}
                className="flex h-auto flex-col items-center gap-2 px-4 py-5 text-center"
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Icon className="size-5" />
                )}
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {item.label}
                  {!busy && <Download className="size-3.5 opacity-60" />}
                </span>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
