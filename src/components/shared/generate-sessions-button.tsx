"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateAllSessions } from "@/server/actions/sessions";
import { Button } from "@/components/ui/button";
import { CalendarPlus } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function GenerateSessionsButton() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const res = await generateAllSessions();
      if (res.success) {
        toast.success(t("sessions.generate_success"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"), { duration: 5000 });
      }
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      <CalendarPlus className="size-4 mr-1" />
      {pending ? t("common.loading") : t("sessions.generate_button")}
    </Button>
  );
}
