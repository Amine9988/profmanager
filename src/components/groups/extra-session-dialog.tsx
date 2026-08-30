"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExtraSession } from "@/server/actions/sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { ActionResult } from "@/server/actions/students";

export function ExtraSessionDialog({ groupId }: { groupId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("groupId", groupId);
    startTransition(async () => {
      const res = await createExtraSession(formData) as ActionResult;
      if (res.success) {
        toast.success(t("groups.extra_session_created"));
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
        <Button variant="outline" size="sm"><Plus className="size-4" /> {t("groups.extra_session")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("groups.extra_session_title")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionDate">{t("common.date")}</Label>
            <Input id="sessionDate" name="sessionDate" type="date" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">{t("groups.start_time")}</Label>
              <Input id="startTime" name="startTime" type="time" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">{t("groups.end_time")}</Label>
              <Input id="endTime" name="endTime" type="time" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("groups.add_extra_session")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
