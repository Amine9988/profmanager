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
  fatherPhone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  monthlyFee: number;
  subscriptionStart: Date | null;
};

export function StudentEditDialog({ student }: { student: StudentInfo }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
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
            <Label htmlFor="fullName">{t("students.form.lastName")}</Label>
            <Input id="fullName" name="fullName" required defaultValue={student.fullName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gradeLevel">{t("common.level")}</Label>
            <LevelSelect name="gradeLevel" defaultValue={student.gradeLevel ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("students.form.phone")}</Label>
              <Input id="phone" name="phone" defaultValue={student.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherPhone">{t("students.form.fatherPhone")}</Label>
              <Input id="fatherPhone" name="fatherPhone" defaultValue={student.fatherPhone ?? ""} />
            </div>
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
