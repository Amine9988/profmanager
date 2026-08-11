"use client";

import { useState, useMemo } from "react";
import type { StudentCardData, SelectionMode } from "./types";

interface StudentSelectorProps {
  students: StudentCardData[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  levels: string[];
}

export function StudentSelector({ students, selectedIds, onSelectionChange, levels }: StudentSelectorProps) {
  const [mode, setMode] = useState<SelectionMode>("all");
  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const filtered = useMemo(() => {
    let list = students;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.fullName.toLowerCase().includes(q));
    }
    if (selectedLevel) {
      list = list.filter((s) => s.gradeLevel === selectedLevel);
    }
    return list;
  }, [students, search, selectedLevel]);

  function applyMode(m: SelectionMode) {
    setMode(m);
    setSearch("");
    setSelectedLevel("");
    setSelectedStudentId("");
    switch (m) {
      case "all":
        onSelectionChange(students.map((s) => s.id));
        break;
      case "batch":
        onSelectionChange([]);
        break;
      case "level":
        if (selectedLevel) {
          const ids = students.filter((s) => s.gradeLevel === selectedLevel).map((s) => s.id);
          onSelectionChange(ids);
        } else {
          onSelectionChange([]);
        }
        break;
      case "single":
        onSelectionChange([]);
        break;
      case "class":
        onSelectionChange([]);
        break;
    }
  }

  function handleLevelChange(lv: string) {
    setSelectedLevel(lv);
    if (lv) {
      const ids = students.filter((s) => s.gradeLevel === lv).map((s) => s.id);
      onSelectionChange(ids);
    } else {
      onSelectionChange([]);
    }
  }

  function handleSingleSelect(id: string) {
    setSelectedStudentId(id);
    onSelectionChange(id ? [id] : []);
  }

  function toggleStudent(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onSelectionChange(next);
  }

  const countLabel = selectedIds.length === 1
    ? "تلميذ واحد"
    : selectedIds.length === 2
      ? "تلميذان"
      : `${selectedIds.length} تلاميذ`;

  return (
    <div className="flex flex-wrap items-center gap-2" dir="rtl">
      <select
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
        value={mode}
        onChange={(e) => applyMode(e.target.value as SelectionMode)}
      >
        <option value="all">جميع التلاميذ</option>
        <option value="level">حسب المستوى</option>
        <option value="batch">اختيار متعدد</option>
        <option value="single">تلميذ واحد</option>
      </select>

      {mode === "level" && (
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
          value={selectedLevel}
          onChange={(e) => handleLevelChange(e.target.value)}
        >
          <option value="">اختر المستوى</option>
          {levels.map((lv) => (
            <option key={lv} value={lv}>{lv}</option>
          ))}
        </select>
      )}

      {mode === "single" && (
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm min-w-[200px]"
          value={selectedStudentId}
          onChange={(e) => handleSingleSelect(e.target.value)}
        >
          <option value="">اختر تلميذا</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      )}

      {mode === "batch" && (
        <input
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm w-48"
          placeholder="بحث..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {mode === "batch" && filtered.length > 0 && (
        <div className="absolute top-full right-0 mt-1 z-50 w-72 max-h-60 overflow-y-auto rounded-lg border bg-background shadow-lg p-1">
          {filtered.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => toggleStudent(s.id)}
                className="size-3.5"
              />
              <span className="truncate">{s.fullName}</span>
              {s.gradeLevel && <span className="text-xs text-muted-foreground mr-auto">{s.gradeLevel}</span>}
            </label>
          ))}
        </div>
      )}

      <span className="text-xs text-muted-foreground">{selectedIds.length > 0 ? countLabel : "لم يتم الاختيار"}</span>
    </div>
  );
}
