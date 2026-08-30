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
import { Plus } from "@/lib/lucide";
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
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>(groups);
  const [clientType, setClientType] = useState<EnrollmentClientType>("institution");

  function applyClientType(next: EnrollmentClientType) {
    setClientType(next);
    setSelectedGroups((prev) => prev.map((g) => ({ ...g, clientType: next })));
  }
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createStudent, {});
  const [enrollPending, startEnrollTransition] = useTransition();

  useEffect(() => {
    if (groups.length > 0) setGroupOptions(groups);
  }, [groups]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/groups")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json) ? json : [];
        const next = list
          .map((g: any) => ({ id: String(g.id || ""), name: String(g.name || "") }))
          .filter((g: GroupOption) => g.id && g.name);
        if (next.length > 0) setGroupOptions(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (state?.success) {
      const studentId = state.id as string;
      const groupsToEnroll = selectedGroups;
      toast.success(t("students.createSuccess"));
      startEnrollTransition(async () => {
        for (const g of groupsToEnroll) {
          const res = await enrollStudent(g.id, studentId, g.clientType ?? clientType);
          if (!res.success) {
            toast.error(`${g.name}: ${res.error ?? t("common.error")}`);
          }
        }
        if (groupsToEnroll.length > 0) toast.success(t("groups.enrolled_success"));
        window.dispatchEvent(new Event("students-changed"));
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
    if (next) {
      setSelectedGroups([]);
      setClientType("institution");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("students.newStudent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
          <ClientTypeField value={clientType} onChange={(v) => applyClientType(v as EnrollmentClientType)} />
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
            />
          </div>
          <div className="space-y-2">
            <Label>{t("students.groups_label")}</Label>
            <StudentGroupsPicker
              groups={groupOptions}
              value={selectedGroups}
              onChange={setSelectedGroups}
              defaultClientType={clientType}
            />
          </div>
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
