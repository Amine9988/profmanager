"use client";

import { useState, useEffect } from "react";

interface Level {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  cycle: string;
  status: string;
}

interface LevelSelectProps {
  defaultValue?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
}

export function LevelSelect({
  defaultValue,
  name = "level",
  required = false,
  placeholder = "اختر المستوى...",
}: LevelSelectProps) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    fetch("/api/levels")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLevels(data.filter((l: Level) => l.status !== "archived"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // The options load asynchronously, while the stored level (defaultValue) is
  // known synchronously. Once the list is ready, push that stored value into a
  // controlled select so the edit form shows the saved level instead of falling
  // back to the first option or the placeholder. It re-syncs when the dialog is
  // reused for a different record.
  useEffect(() => {
    if (!loading) setValue(defaultValue ?? "");
  }, [loading, defaultValue]);

  function groupLabel(cycle: string): string {
    switch (cycle) {
      case "primary": return "ابتدائي";
      case "middle":  return "متوسط";
      case "secondary": return "ثانوي";
      default: return cycle;
    }
  }

  const grouped = new Map<string, Level[]>();
  for (const l of levels) {
    if (!grouped.has(l.cycle)) grouped.set(l.cycle, []);
    grouped.get(l.cycle)!.push(l);
  }

  const CLASSES =
    "flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all duration-200 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none disabled:opacity-50";

  if (loading) {
    return (
      <select disabled className={CLASSES} value="" aria-label={placeholder}>
        <option value="">جاري التحميل...</option>
      </select>
    );
  }

  return (
    <select
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      required={required}
      className={CLASSES}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {Array.from(grouped.entries()).map(([cycle, items]) => (
        <optgroup key={cycle} label={groupLabel(cycle)}>
          {items.map((level) => (
            <option key={level.id} value={level.nameAr}>
              {level.nameAr}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}