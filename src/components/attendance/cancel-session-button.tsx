"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSession } from "@/server/actions/sessions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelSession(sessionId);
      if (res.success) {
        toast.success(t("attendance.session_cancelled"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        {t("attendance.cancel_session")}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold">{t("attendance.confirm_cancel_title")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{t("attendance.confirm_cancel_desc")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
                {isPending ? t("common.saving") : t("attendance.confirm_cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
