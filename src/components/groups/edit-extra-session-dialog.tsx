"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateExtraSession } from "@/server/actions/sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Pencil } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { ActionResult } from "@/server/actions/students";

export function EditExtraSessionDialog({ session }: { session: { id: string; sessionDate: string; startTime: string | null; endTime: string | null } }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("sessionId", session.id);
    startTransition(async () => {
      const res = await updateExtraSession(formData) as ActionResult;
      if (res.success) {
        toast.success(t("common.success"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="size-3" /> {t("common.edit")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("common.edit")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionDate">{t("common.date")}</Label>
            <Input id="sessionDate" name="sessionDate" type="date" defaultValue={session.sessionDate} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">{t("groups.start_time")}</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue={session.startTime ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">{t("groups.end_time")}</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue={session.endTime ?? ""} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}