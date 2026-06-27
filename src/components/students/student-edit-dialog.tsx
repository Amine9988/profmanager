"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateStudent } from "@/server/actions/students";
import type { ActionResult } from "@/server/actions/students";
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
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { useT } from "@/lib/i18n";

type StudentInfo = {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  schoolName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  dateOfBirth: Date | null;
  notes: string | null;
  monthlyFee: number;
  subscriptionStart: Date | null;
  billingType: string | null;
};

export function StudentEditDialog({ student }: { student: StudentInfo }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [billingType, setBillingType] = useState(student.billingType || "monthly");
  const boundAction = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(boundAction, {});

  useEffect(() => {
    if (state?.success) {
      toast.success(t("students.update_success"));
      requestAnimationFrame(() => {
        setOpen(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  function handleOpenChange(v: boolean) {
    if (v) {
      setFormKey((k) => k + 1);
    }
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> {t("common.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent key={formKey} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("students.edit_title")}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("students.form.fullName")}</Label>
            <Input id="fullName" name="fullName" required defaultValue={student.fullName} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">{t("students.form.gradeLevel")}</Label>
              <LevelSelect name="gradeLevel" defaultValue={student.gradeLevel ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schoolName">{t("students.form.schoolName")}</Label>
              <Input id="schoolName" name="schoolName" defaultValue={student.schoolName ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("students.form.phone")}</Label>
              <Input id="phone" name="phone" defaultValue={student.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" name="email" type="email" defaultValue={student.email ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{t("students.form.address")}</Label>
            <Input id="address" name="address" defaultValue={student.address ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">{t("students.form.dateOfBirth")}</Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().slice(0, 10) : ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monthlyFee">{t("payments.monthly_fee")}</Label>
              <Input id="monthlyFee" name="monthlyFee" type="number" min="0" step="100" required defaultValue={student.monthlyFee ?? 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscriptionStart">{t("payments.subscription_start")}</Label>
              <Input id="subscriptionStart" name="subscriptionStart" type="date" required defaultValue={student.subscriptionStart ? new Date(student.subscriptionStart).toISOString().slice(0, 10) : ""} />
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
            <textarea
              id="notes"
              name="notes"
              defaultValue={student.notes ?? ""}
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("students.saving") : t("students.save_changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
