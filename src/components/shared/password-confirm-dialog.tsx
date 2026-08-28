"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock } from "lucide-react";
import { toast } from "sonner";

export function PasswordConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    if (!password.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword("");
        onOpenChange(false);
        onConfirm();
      } else {
        toast.error(t("trash.wrong_password"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPassword(""); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5" />
            {title || t("trash.enter_password")}
          </DialogTitle>
        </DialogHeader>
        <Input
          type="password"
          placeholder={t("trash.password_placeholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleVerify(); }}
          autoFocus
        />
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => { onOpenChange(false); setPassword(""); }}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={handleVerify} disabled={verifying || !password.trim()}>
            {verifying ? "..." : t("trash.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
