"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, Check } from "@/lib/lucide";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface UpdateStatus {
  status: string;
  currentVersion: string;
  info: { version?: string; downloadUrl?: string } | null;
  error: string | null;
  downloadProgress: { percent?: number; transferred?: number; total?: number } | null;
  canAutoDownload?: boolean;
}

declare global {
  interface Window {
    updaterAPI?: {
      checkForUpdates: () => Promise<{ ok: boolean; error?: string; openUrl?: string }>;
      downloadUpdate: () => Promise<{ ok: boolean; error?: string; openUrl?: string }>;
      installUpdate: () => Promise<void>;
      openInstaller: (url: string) => Promise<{ ok: boolean }>;
      getStatus: () => Promise<UpdateStatus>;
      onStatus: (cb: (data: UpdateStatus) => void) => () => void;
    };
  }
}

export function UpdateCard() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [hasUpdater, setHasUpdater] = useState(false);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!window.updaterAPI) return;
    setHasUpdater(true);
    window.updaterAPI.getStatus().then(setStatus);
    const off = window.updaterAPI.onStatus(setStatus);
    window.updaterAPI.checkForUpdates().catch(() => {});
    return () => { off?.(); };
  }, []);

  useEffect(() => {
    if (!status) return;
    if (status.status === "available" && prevStatus.current !== "available") {
      toast.info(`${t("settings.updateAvailable")} v${status.info?.version || ""}`.trim());
    }
    if (status.status === "downloaded" && prevStatus.current !== "downloaded") {
      toast.success(t("settings.updateDownloaded"));
    }
    prevStatus.current = status.status;
  }, [status, t]);

  const check = useCallback(async () => {
    if (!window.updaterAPI) return;
    await window.updaterAPI.checkForUpdates();
  }, []);

  const download = useCallback(async () => {
    if (!window.updaterAPI) return;
    const result = await window.updaterAPI.downloadUpdate();
    const url = result?.openUrl || status?.info?.downloadUrl;
    if (url && (result?.openUrl || status?.canAutoDownload === false)) {
      await window.updaterAPI.openInstaller(url);
    }
  }, [status]);

  const install = useCallback(async () => {
    if (!window.updaterAPI) return;
    await window.updaterAPI.installUpdate();
  }, []);

  if (!hasUpdater) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.checkUpdate")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("settings.updateDesktopOnly")}</p>
        </CardContent>
      </Card>
    );
  }

  const renderBody = () => {
    if (!status) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

    switch (status.status) {
      case "checking":
        return (
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" />
            <span className="text-sm">{t("settings.checkingUpdate")}</span>
          </div>
        );
      case "available":
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-green-600">
              {t("settings.updateAvailable")} {status.info?.version ? `→ v${status.info.version}` : ""}
            </p>
            <Button size="sm" onClick={download}>
              <Download className="size-4" />
              {status.canAutoDownload === false ? t("settings.downloadInstaller") : t("settings.downloadUpdate")}
            </Button>
          </div>
        );
      case "downloading":
        return (
          <div className="space-y-2">
            <p className="text-sm">{t("settings.downloading")}...</p>
            {status.downloadProgress?.percent != null && (
              <Progress value={status.downloadProgress.percent} className="h-2" />
            )}
          </div>
        );
      case "downloaded":
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-green-600">{t("settings.updateDownloaded")}</p>
            <Button size="sm" onClick={install}>
              <Check className="size-4" /> {t("settings.installUpdate")}
            </Button>
          </div>
        );
      case "up-to-date":
        return (
          <div className="flex items-center gap-2">
            <Check className="size-4 text-green-600" />
            <span className="text-sm text-green-600">{t("settings.upToDate")}</span>
          </div>
        );
      default:
        return (
          <Button size="sm" variant="outline" onClick={check}>
            <RefreshCw className="size-4" /> {t("settings.checkUpdate")}
          </Button>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.checkUpdate")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("settings.currentVersion")}: v{status?.currentVersion || "?"}
        </p>
        {renderBody()}
        {status?.status !== "checking" && status?.status !== "downloading" && (
          <Button size="sm" variant="ghost" onClick={check}>
            <RefreshCw className="size-4" /> {t("settings.checkUpdate")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
