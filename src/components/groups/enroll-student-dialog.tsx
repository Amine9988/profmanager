"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollStudent } from "@/server/actions/groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

type Student = { id: string; fullName: string; gradeLevel?: string | null };

export function EnrollStudentDialog({
  groupId,
  level,
  availableStudents,
}: {
  groupId: string;
  level: string | null;
  availableStudents: Student[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = availableStudents.filter((s) =>
    (!level || String(s.gradeLevel ?? "") === String(level)) &&
    s.fullName.toLowerCase().includes(search.toLowerCase())
  );

  function handleEnroll(studentId: string) {
    startTransition(async () => {
      const res = await enrollStudent(groupId, studentId);
      if (res.success) {
        toast.success(t("groups.enrolled_success"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="size-4" /> {t("groups.enroll_button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.enroll_title")}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder={t("groups.enroll_search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("groups.no_students_available")}
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                disabled={isPending}
                onClick={() => handleEnroll(s.id)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                {s.fullName}
                <UserPlus className="size-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
