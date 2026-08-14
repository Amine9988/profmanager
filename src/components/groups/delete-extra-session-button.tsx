"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteExtraSession } from "@/server/actions/sessions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function DeleteExtraSessionButton({ sessionId }: { sessionId: string }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteExtraSession(sessionId);
      if (res.success) {
        toast.success(t("groups.deleted_success"));
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
      className="size-7 text-muted-foreground hover:text-destructive"
      onClick={handleDelete}
      disabled={isPending}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}