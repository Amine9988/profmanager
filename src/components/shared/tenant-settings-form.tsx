"use client";

import { useTransition } from "react";
import { updateTenantSettings } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Save } from "lucide-react";

type Tenant = {
  name: string;
  timezone: string;
};

export function TenantSettingsForm({ tenant }: { tenant: Tenant }) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateTenantSettings(formData);
      if (res.success) {
        toast.success(t("settings.saved"));
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("settings.schoolName")}</Label>
        <Input id="name" name="name" defaultValue={tenant.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">{t("settings.timezone")}</Label>
        <Input id="timezone" name="timezone" defaultValue={tenant.timezone} />
      </div>
      <Button type="submit" disabled={isPending}>
        <Save className="size-4 mr-1" />{isPending ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
