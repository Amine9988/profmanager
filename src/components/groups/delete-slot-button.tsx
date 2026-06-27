"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteScheduleSlot } from "@/server/actions/groups";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function DeleteSlotButton({ slotId }: { slotId: string }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteScheduleSlot(slotId);
      if (res.success) {
        toast.success(t("groups.slot_deleted"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-destructive"
      onClick={handleDelete}
      disabled={isPending}
    >
      <X className="size-3" />
    </Button>
  );
}
