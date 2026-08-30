"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGroup } from "@/server/actions/groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function GroupActions({ groupId }: { groupId: string }) {
  const t = useT();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteGroup(groupId);
      if (res.success) {
        toast.success(t("groups.deleted_success"));
        router.push("/groups");
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="size-4" /> {t("common.delete")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groups.delete_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("groups.delete_warning")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? t("groups.deleting") : t("groups.delete_permanent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
