"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudent, type ActionResult } from "@/server/actions/students";
import { enrollStudent } from "@/server/actions/groups";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { LevelSelect } from "@/components/shared/level-select";
import { ClientTypeField } from "@/components/students/client-type-field";
import { StudentGroupsPicker, type GroupOption, type EnrollmentClientType } from "@/components/students/student-groups-picker";
import { useT } from "@/lib/i18n";

export function StudentCreateDialog({ groups }: { groups: GroupOption[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>([]);
  const [clientType, setClientType] = useState<EnrollmentClientType>("institution");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createStudent, {});
  const [enrollPending, startEnrollTransition] = useTransition();

  useEffect(() => {
    if (state?.success) {
      const studentId = state.id as string;
      if (selectedGroups.length > 0) {
        startEnrollTransition(async () => {
          for (const g of selectedGroups) {
            const res = await enrollStudent(g.id, studentId, g.clientType ?? clientType);
            if (!res.success) {
              toast.error(`${g.name}: ${res.error ?? t("common.error")}`);
            }
          }
          toast.success(t("groups.enrolled_success"));
        });
      }
      toast.success(t("students.createSuccess"));
      requestAnimationFrame(() => {
        setOpen(false);
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setSelectedGroups([]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <div className="space-y-2">
            <Label htmlFor="gradeLevel">{t("common.level")}</Label>
            <LevelSelect name="gradeLevel" required />
          </div>
          <ClientTypeField defaultValue={clientType} onChange={(v) => setClientType(v as EnrollmentClientType)} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("students.form.phone")}</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherPhone">{t("students.form.fatherPhone")}</Label>
              <Input id="fatherPhone" name="fatherPhone" />
            </div>
          </div>
          {groups.length > 0 && (
            <div className="space-y-2">
              <Label>{t("students.groups_label")}</Label>
              <StudentGroupsPicker groups={groups} value={selectedGroups} onChange={setSelectedGroups} defaultClientType={clientType} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || enrollPending}>
              {pending || enrollPending ? t("common.saving") : t("students.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
