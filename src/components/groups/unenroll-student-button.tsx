"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unenrollStudent } from "@/server/actions/groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserMinus } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function UnenrollStudentButton({
  groupId,
  studentId,
  studentName,
}: {
  groupId: string;
  studentId: string;
  studentName: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleUnenroll() {
    startTransition(async () => {
      const res = await unenrollStudent(groupId, studentId);
      if (res.success) {
        toast.success(t("groups.studentUnenrolled"));
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
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          title={t("groups.unenroll")}
        >
          <UserMinus className="size-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.unenroll")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {studentName} · {t("groups.delete_warning")}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleUnenroll} disabled={isPending}>
            {isPending ? t("groups.deleting") : t("groups.unenroll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
