"use client";

import { useActionState, useEffect, useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent } from "@/server/actions/students";
import { enrollStudent, unenrollStudent, updateEnrollmentClientType } from "@/server/actions/groups";
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
import { Pencil } from "@/lib/lucide";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { ClientTypeField } from "@/components/students/client-type-field";
import { StudentGroupsPicker, type GroupOption, type EnrollmentClientType } from "@/components/students/student-groups-picker";
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
  clientType?: string | null;
};

export function StudentEditDialog({
  student,
  enrolledGroups = [],
  allGroups = [],
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: {
  student: StudentInfo;
  enrolledGroups?: GroupOption[];
  allGroups?: GroupOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>(enrolledGroups);
  const [clientType, setClientType] = useState<EnrollmentClientType>(
    (student.clientType as EnrollmentClientType) || "institution"
  );

  function applyClientType(next: EnrollmentClientType) {
    setClientType(next);
    setSelectedGroups((prev) => prev.map((g) => ({ ...g, clientType: next })));
  }
  const formRef = useRef<HTMLFormElement>(null);
  const boundAction = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(boundAction, {});
  const [groupsPending, startGroupsTransition] = useTransition();

  useEffect(() => {
    if (state?.success) {
      const initialMap = new Map(enrolledGroups.map((g) => [g.id, g.clientType ?? "institution"]));
      const currentIds = new Set(selectedGroups.map((g) => g.id));
      const toAdd = selectedGroups.filter((g) => !initialMap.has(g.id));
      const toRetype = selectedGroups.filter((g) => {
        const prev = initialMap.get(g.id);
        return prev !== undefined && prev !== (g.clientType ?? "institution");
      });
      const toRemove = enrolledGroups.filter((g) => !currentIds.has(g.id));

      if (toAdd.length > 0 || toRemove.length > 0 || toRetype.length > 0) {
        startGroupsTransition(async () => {
          for (const g of toAdd) {
            const res = await enrollStudent(g.id, student.id, g.clientType ?? "institution");
            if (!res.success) toast.error(`${g.name}: ${res.error ?? t("common.error")}`);
          }
          for (const g of toRetype) {
            const res = await updateEnrollmentClientType(g.id, student.id, g.clientType ?? "institution");
            if (!res.success) toast.error(`${g.name}: ${res.error ?? t("common.error")}`);
          }
          for (const g of toRemove) {
            const res = await unenrollStudent(g.id, student.id);
            if (!res.success) toast.error(`${g.name}: ${res.error ?? t("common.error")}`);
          }
          router.refresh();
        });
      }

      window.dispatchEvent(new Event("students-changed"));
      toast.success(t("students.update_success"));
      requestAnimationFrame(() => {
        handleOpenChange(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleOpenChange(v: boolean) {
    if (v) {
      setSelectedGroups(enrolledGroups);
      setClientType((student.clientType as EnrollmentClientType) || "institution");
    }
    if (!isControlled) setUncontrolledOpen(v);
    controlledOnOpenChange?.(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="size-4" /> {t("common.edit")}
          </Button>
        </DialogTrigger>
      )}
      {open && (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            <ClientTypeField value={clientType} onChange={(v) => applyClientType(v as EnrollmentClientType)} />
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
            <div className="space-y-2">
              <Label htmlFor="email">{t("students.form.parentEmail")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                placeholder={t("students.form.emailPlaceholder")}
                defaultValue={student.email ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("students.groups_label")}</Label>
              <StudentGroupsPicker
                groups={allGroups}
                value={selectedGroups}
                onChange={setSelectedGroups}
                defaultClientType={clientType}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || groupsPending}>
                {pending || groupsPending ? t("students.saving") : t("students.save_changes")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
