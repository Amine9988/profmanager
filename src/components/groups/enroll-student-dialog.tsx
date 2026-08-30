"use client";

import { useState, useEffect, useTransition, useRef } from "react";
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
import { UserPlus, Loader2 } from "@/lib/lucide";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

type Student = { id: string; fullName: string; gradeLevel?: string | null };

export function EnrollStudentDialog({
  groupId,
  availableStudents: _ignored,
}: {
  groupId: string;
  availableStudents?: Student[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    const params = new URLSearchParams({
      status: "active",
      limit: "30",
      page: "1",
      excludeGroupId: groupId,
    });
    if (debounced) params.set("q", debounced);
    fetch(`/api/students?${params}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.data || [];
        setResults(list.map((s: any) => ({ id: s.id, fullName: s.fullName, gradeLevel: s.gradeLevel })));
      })
      .catch((e) => { if (e?.name !== "AbortError") setResults([]); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [open, debounced, groupId]);

  function handleEnroll(studentId: string) {
    startTransition(async () => {
      const res = await enrollStudent(groupId, studentId);
      if (res.success) {
        toast.success(t("groups.enrolled_success"));
        setResults((prev) => prev.filter((s) => s.id !== studentId));
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setResults([]); } }}>
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
          autoFocus
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("groups.no_students_available")}
            </p>
          )}
          {!loading && results.map((s) => (
            <button
              key={s.id}
              disabled={isPending}
              onClick={() => handleEnroll(s.id)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              <span>
                {s.fullName}
                {s.gradeLevel ? <span className="ms-2 text-xs text-muted-foreground">{s.gradeLevel}</span> : null}
              </span>
              <UserPlus className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
