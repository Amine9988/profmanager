"use client";

import { Label } from "@/components/ui/label";
import { Building2, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ClientTypeField({
  defaultValue = "institution",
  onChange,
}: {
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const t = useT();

  const options = [
    { value: "institution", label: t("students.client_institution"), Icon: Building2 },
    { value: "teacher", label: t("students.client_teacher"), Icon: UserRound },
  ];

  return (
    <div className="space-y-2">
      <Label>{t("students.client_type_label")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value, label, Icon }) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
              "[&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary/5 [&:has(input:checked)]:font-medium"
            )}
          >
            <input
              type="radio"
              name="clientType"
              value={value}
              defaultChecked={defaultValue === value}
              onChange={() => onChange?.(value)}
              className="sr-only"
            />
            <Icon className="size-4 text-muted-foreground" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("students.client_type_hint")}</p>
    </div>
  );
}
