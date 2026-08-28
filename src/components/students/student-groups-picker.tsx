"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";

export type EnrollmentClientType = "institution" | "teacher";

export type GroupOption = {
  id: string;
  name: string;
  /** Per-enrollment client type: the student can be a teacher-client in one
   *  group and an institution-client in another. */
  clientType?: EnrollmentClientType;
};

export function StudentGroupsPicker({
  groups,
  value,
  onChange,
  defaultClientType = "institution",
}: {
  groups: GroupOption[];
  value: GroupOption[];
  onChange: (next: GroupOption[]) => void;
  defaultClientType?: EnrollmentClientType;
}) {
  const t = useT();

  const remaining = useMemo(() => {
    const ids = new Set(value.map((g) => g.id));
    return groups.filter((g) => !ids.has(g.id));
  }, [groups, value]);

  function addGroup(id: string) {
    if (!id) return;
    const g = remaining.find((x) => x.id === id);
    if (g) onChange([...value, { ...g, clientType: defaultClientType }]);
  }

  function removeGroup(id: string) {
    onChange(value.filter((g) => g.id !== id));
  }

  function toggleType(id: string) {
    onChange(value.map((g) =>
      g.id === id ? { ...g, clientType: g.clientType === "teacher" ? "institution" : "teacher" } : g
    ));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1 pr-1">
              <button
                type="button"
                onClick={() => toggleType(g.id)}
                className={`rounded-full p-0.5 ${g.clientType === "teacher" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`}
                title={g.clientType === "teacher" ? t("students.client_teacher") : t("students.client_institution")}
              >
                {g.clientType === "teacher" ? <UserRound className="size-3" /> : <Building2 className="size-3" />}
              </button>
              {g.name}
              <button
                type="button"
                onClick={() => removeGroup(g.id)}
                className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                title={t("common.delete")}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {remaining.length > 0 ? (
        <Select value="" onValueChange={addGroup}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("students.groups_add_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">{t("students.groups_all_added")}</p>
      )}
    </div>
  );
}
