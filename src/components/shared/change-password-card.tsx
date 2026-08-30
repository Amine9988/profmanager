"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, Eye, EyeOff, Check } from "@/lib/lucide";
import { toast } from "sonner";

export function ChangePasswordCard() {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetError, setResetError] = useState(false);

  async function handleSubmit() {
    if (!currentPassword || !newPassword) {
      toast.error(t("settings.password_fill_all"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.password_no_match"));
      return;
    }
    if (newPassword.length < 4) {
      toast.error(t("settings.password_too_short"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t("settings.password_changed"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else if (data.error === "wrong_password") {
        toast.error(t("settings.password_wrong_current"));
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="size-4" />
          {t("settings.password_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("settings.password_hint")}</p>

        <div className="space-y-2">
          <Label>{t("settings.password_current")}</Label>
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("settings.password_current_placeholder")}
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(!showCurrent)}>
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("settings.password_new")}</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("settings.password_new_placeholder")}
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(!showNew)}>
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("settings.password_confirm")}</Label>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder={t("settings.password_confirm_placeholder")}
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {confirmPassword && newPassword === confirmPassword && (
            <p className="text-xs text-green-600 flex items-center gap-1"><Check className="size-3" /> {t("settings.password_match")}</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSubmit} disabled={saving}>
            <Lock className="size-4 mr-1" />
            {saving ? "..." : t("settings.password_save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setResetInput(""); setResetError(false); setShowResetDialog(true); }}
          >
            {t("settings.password_forgot") || "نسيت كلمة المرور؟ إعادة إلى الافتراضية"}
          </Button>
        </div>
      </CardContent>
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("settings.password_forgot") || "إعادة كلمة المرور"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("settings.password_enter_default") || "أدخل كلمة المرور الافتراضية profmanager1234 للتأكيد:"}</p>
            <Input
              type="password"
              value={resetInput}
              onChange={(e) => { setResetInput(e.target.value); setResetError(false); }}
              placeholder="profmanager1234"
              autoFocus
            />
            {resetError && <p className="text-sm text-destructive">{t("caisse.wrong_password") || "كلمة المرور غير صحيحة"}</p>}
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowResetDialog(false); setResetInput(""); setResetError(false); }}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (resetInput !== "profmanager1234") { setResetError(true); toast.error(t("caisse.wrong_password") || "كلمة المرور غير صحيحة"); return; }
                if (!confirm(t("settings.password_reset_confirm") || "هل أنت متأكد من إعادة كلمة المرور إلى الافتراضية profmanager1234؟")) return;
                const res = await fetch("/api/auth/reset-password", { method: "POST" });
                if (res.ok) {
                  toast.success(t("settings.password_reset_success") || "تمت إعادة كلمة المرور إلى profmanager1234");
                  setShowResetDialog(false);
                  setResetInput("");
                } else toast.error(t("common.error"));
              }}
            >
              {t("common.confirm") || "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
