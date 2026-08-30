"use client";

import { useMemo } from "react";
import { X, Building2, UserRound } from "@/lib/lucide";
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
        <select
          className="border-input flex h-9 w-full rounded-lg border bg-background px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]"
          value=""
          onChange={(e) => addGroup(e.target.value)}
        >
          <option value="" disabled>
            {t("students.groups_add_placeholder")}
          </option>
          {remaining.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("groups.no_groups")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("students.groups_all_added")}</p>
      )}
    </div>
  );
}
