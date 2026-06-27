"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createStudent, type ActionResult } from "@/server/actions/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { useT } from "@/lib/i18n";

export function StudentCreateDialog() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [billingType, setBillingType] = useState("monthly");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createStudent,
    {}
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(t("students.createSuccess"));
      requestAnimationFrame(() => {
        setOpen(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("students.newStudent")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("students.newStudent")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("students.form.lastName")}</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">{t("common.level")}</Label>
              <LevelSelect name="gradeLevel" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schoolName">{t("students.school")}</Label>
              <Input id="schoolName" name="schoolName" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("common.phone")}</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" name="email" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monthlyFee">{t("payments.monthly_fee")}</Label>
              <Input id="monthlyFee" name="monthlyFee" type="number" min="0" step="100" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscriptionStart">{t("payments.subscription_start")}</Label>
              <Input id="subscriptionStart" name="subscriptionStart" type="date" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingType">{t("payments.billing_type")}</Label>
            <input type="hidden" name="billingType" value={billingType} />
            <Select value={billingType} onValueChange={setBillingType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("payments.monthly")}</SelectItem>
                <SelectItem value="per_session">{t("groups.per_session")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Input id="notes" name="notes" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("students.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
