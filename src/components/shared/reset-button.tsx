"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";

export function ResetButton() {
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const t = useT();

  async function handleReset() {
    setStep("loading");
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        setStep("done");
        setTimeout(() => { window.location.href = "/overview"; }, 2000);
      } else {
        alert(t("common.error"));
        setStep("idle");
      }
    } catch {
      alert(t("common.error"));
      setStep("idle");
    }
  }

  if (step === "idle") {
    return (
      <Button variant="destructive" onClick={() => setStep("confirm")}>
        <AlertTriangle className="size-4 mr-1" />{t("settings.reset.button")}
      </Button>
    );
  }

  if (step === "confirm") {
    return (
      <div className="border border-destructive/30 bg-destructive/5 p-4 rounded-xl">
        <p className="text-destructive font-semibold mb-3 text-sm">
          {t("settings.reset.warning")}
        </p>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={handleReset}>
            {t("settings.reset.confirm")}
          </Button>
          <Button variant="outline" onClick={() => setStep("idle")}>
            {t("settings.reset.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />{t("settings.reset.loading")}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-success font-medium">
      <CheckCircle2 className="size-4" />{t("settings.reset.success")}
    </div>
  );
}
