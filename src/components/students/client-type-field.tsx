"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Building2, UserRound } from "@/lib/lucide";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ClientTypeField({
  value,
  defaultValue = "institution",
  onChange,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const t = useT();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  function select(next: string) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  }

  const options = [
    { value: "institution", label: t("students.client_institution"), Icon: Building2 },
    { value: "teacher", label: t("students.client_teacher"), Icon: UserRound },
  ];

  return (
    <div className="space-y-2">
      <Label>{t("students.client_type_label")}</Label>
      <input type="hidden" name="clientType" value={current} />
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value: option, label, Icon }) => {
          const selected = current === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => select(option)}
              aria-pressed={selected}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/5 font-medium"
                  : "hover:bg-muted/50"
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("students.client_type_hint")}</p>
    </div>
  );
}
