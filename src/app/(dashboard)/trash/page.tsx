"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, RotateCcw, CreditCard, Banknote, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

interface DeletedItem {
  id: string;
  sourceType: "payment" | "cash_movement";
  originalData: string;
  description: string | null;
  deletedAt: string;
}

export default function TrashPage() {
  const t = useT();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDelete, setPermanentDelete] = useState<DeletedItem | null>(null);
  const [emptyTrash, setEmptyTrash] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<"permanentDelete" | "emptyTrash" | null>(null);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const fetchTrash = useCallback(async () => {
    try {
      const res = await fetch("/api/trash");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  async function handleRestore(item: DeletedItem) {
    setRestoring(item.id);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(t("trash.restore_success"));
        fetchTrash();
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setRestoring(null);
    }
  }

  async function verifyPasswordAndProceed() {
    if (!password.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPasswordDialog(null);
        setPassword("");
        if (passwordDialog === "permanentDelete" && permanentDelete) {
          await executePermanentDelete();
        } else if (passwordDialog === "emptyTrash") {
          await executeEmptyTrash();
        }
      } else {
        toast.error(t("trash.wrong_password"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setVerifying(false);
    }
  }

  async function executePermanentDelete() {
    if (!permanentDelete) return;
    try {
      const res = await fetch(`/api/trash/${permanentDelete.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("trash.delete_permanently_success"));
        setPermanentDelete(null);
        fetchTrash();
      } else {
        toast.error(t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  async function executeEmptyTrash() {
    try {
      const res = await fetch("/api/trash", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("trash.empty_success"));
        setEmptyTrash(false);
        fetchTrash();
      } else {
        toast.error(t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    }
  }

  function parseOriginal(item: DeletedItem) {
    try {
      return JSON.parse(item.originalData);
    } catch {
      return {};
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trash2 className="size-6" />
          {t("trash.title")}
        </h1>
        {items.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setEmptyTrash(true)}>
            <Trash2 className="size-4 mr-1" />
            {t("trash.empty_trash")}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Trash2 className="size-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">{t("trash.empty")}</p>
            <p className="text-sm">{t("trash.empty_hint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const data = parseOriginal(item);
            const isPayment = item.sourceType === "payment";
            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${isPayment ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                    {isPayment ? <CreditCard className="size-5" /> : <Banknote className="size-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.description || (isPayment ? t("trash.payment") : t("trash.movement"))}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {isPayment && data.month && <span>{t("payments.month")}: {data.month}</span>}
                      {isPayment && (
                        <>
                          <span>{t("payments.amount_due")}: {formatCurrency(data.amountDue)}</span>
                          <span>{t("payments.amount_paid")}: {formatCurrency(data.amountPaid)}</span>
                        </>
                      )}
                      {!isPayment && (
                        <>
                          <span className={data.type === "income" ? "text-green-600" : "text-red-600"}>
                            {data.type === "income" ? t("caisse.income") : t("caisse.expense")}
                          </span>
                          <span>{formatCurrency(data.amount)}</span>
                          {data.date && <span>{data.date}</span>}
                        </>
                      )}
                      <span>{t("trash.deleted_at")}: {new Date(item.deletedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(item)}
                      disabled={restoring === item.id}
                    >
                      <RotateCcw className="size-4 mr-1" />
                      {restoring === item.id ? "..." : t("trash.restore")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPermanentDelete(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!permanentDelete} onOpenChange={() => setPermanentDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              {t("trash.delete_permanently_title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("trash.delete_permanently_confirm")}</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setPermanentDelete(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { setPassword(""); setPasswordDialog("permanentDelete"); }}>
              <Lock className="size-4 mr-1" />
              {t("trash.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emptyTrash} onOpenChange={() => setEmptyTrash(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              {t("trash.empty_trash_title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("trash.empty_trash_confirm")}</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setEmptyTrash(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { setPassword(""); setPasswordDialog("emptyTrash"); }}>
              <Lock className="size-4 mr-1" />
              {t("trash.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordDialog} onOpenChange={() => { setPasswordDialog(null); setPassword(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5" />
              {t("trash.enter_password")}
            </DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            placeholder={t("trash.password_placeholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") verifyPasswordAndProceed(); }}
            autoFocus
          />
          <button
            type="button"
            className="text-xs text-primary underline text-right"
            onClick={async () => {
              const input = prompt(t("settings.password_enter_default") || "أدخل كلمة المرور الافتراضية profmanager1234 للتأكيد:");
              if (input === null) return;
              if (input !== "profmanager1234") { toast.error(t("caisse.wrong_password")); return; }
              if (!confirm(t("settings.password_reset_confirm"))) return;
              const r = await fetch("/api/auth/reset-password", { method: "POST" });
              if (r.ok) { toast.success(t("settings.password_reset_success")); setPassword(""); } else toast.error(t("common.error"));
            }}
          >
            {t("settings.password_forgot")}
          </button>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setPasswordDialog(null); setPassword(""); }}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={verifyPasswordAndProceed} disabled={verifying || !password.trim()}>
              {verifying ? "..." : t("trash.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
