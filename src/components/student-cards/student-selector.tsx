"use client";

import { useState, useEffect, useRef } from "react";
import type { StudentCardData, SelectionMode } from "./types";
import { Loader2 } from "@/lib/lucide";
import { toast } from "sonner";

const MAX_CARDS = 100;

interface StudentSelectorProps {
  students: StudentCardData[];
  selectedIds: string[];
  selectedStudents: StudentCardData[];
  onSelectionChange: (ids: string[], students: StudentCardData[]) => void;
  levels: string[];
}

function toCard(s: any): StudentCardData {
  return {
    id: s.id,
    fullName: s.fullName,
    gradeLevel: s.gradeLevel ?? null,
    schoolName: s.schoolName ?? null,
    phone: s.phone ?? null,
    address: s.address ?? null,
    registrationNumber: "",
  };
}

export function StudentSelector({
  selectedIds,
  selectedStudents,
  onSelectionChange,
  levels,
}: StudentSelectorProps) {
  const [mode, setMode] = useState<SelectionMode>("batch");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [results, setResults] = useState<StudentCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (mode !== "batch" && mode !== "single") return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    const params = new URLSearchParams({ status: "active", limit: "40", page: "1", view: "full" });
    if (debounced) params.set("q", debounced);
    fetch(`/api/students?${params}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.data || [];
        setResults(list.map(toCard));
      })
      .catch((e) => { if (e?.name !== "AbortError") setResults([]); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [mode, debounced]);

  async function applyMode(m: SelectionMode) {
    setMode(m);
    setSearch("");
    setSelectedLevel("");
    if (m === "all") {
      setLoading(true);
      try {
        const res = await fetch(`/api/students?status=active&limit=${MAX_CARDS}&page=1&view=full`);
        const json = await res.json();
        const list = (Array.isArray(json) ? json : json.data || []).map(toCard);
        const total = Number(res.headers.get("X-Total-Count") || json.total || list.length);
        if (total > MAX_CARDS) {
          toast.message(`تم تحديد أول ${MAX_CARDS} تلميذًا فقط من أصل ${total} — استخدم البحث أو المستوى للباقي`);
        }
        onSelectionChange(list.map((s: StudentCardData) => s.id), list);
      } catch {
        onSelectionChange([], []);
      } finally {
        setLoading(false);
      }
    } else {
      onSelectionChange([], []);
    }
  }

  async function handleLevelChange(lv: string) {
    setSelectedLevel(lv);
    if (!lv) {
      onSelectionChange([], []);
      return;
    }
    setLoading(true);
    try {
      // Fetch up to MAX_CARDS matching this level via search on gradeLevel client-side after paginated fetch
      // API doesn't filter by level yet — fetch pages of active students filtered client-side (capped)
      const collected: StudentCardData[] = [];
      for (let page = 1; page <= 5 && collected.length < MAX_CARDS; page++) {
        const res = await fetch(`/api/students?status=active&limit=100&page=${page}&view=full`);
        const json = await res.json();
        const list = (Array.isArray(json) ? json : json.data || []).map(toCard) as StudentCardData[];
        if (list.length === 0) break;
        for (const s of list) {
          if (s.gradeLevel === lv) {
            collected.push(s);
            if (collected.length >= MAX_CARDS) break;
          }
        }
        if (list.length < 100) break;
      }
      if (collected.length >= MAX_CARDS) {
        toast.message(`الحد الأقصى ${MAX_CARDS} بطاقة في المرة`);
      }
      onSelectionChange(collected.map((s) => s.id), collected);
    } catch {
      onSelectionChange([], []);
    } finally {
      setLoading(false);
    }
  }

  function handleSingleSelect(id: string) {
    const s = results.find((x) => x.id === id);
    onSelectionChange(s ? [s.id] : [], s ? [s] : []);
  }

  function toggleStudent(s: StudentCardData) {
    const map = new Map(selectedStudents.map((x) => [x.id, x]));
    if (map.has(s.id)) map.delete(s.id);
    else {
      if (map.size >= MAX_CARDS) {
        toast.error(`الحد الأقصى ${MAX_CARDS} بطاقة`);
        return;
      }
      map.set(s.id, s);
    }
    const next = [...map.values()];
    onSelectionChange(next.map((x) => x.id), next);
  }

  const countLabel = selectedIds.length === 1
    ? "تلميذ واحد"
    : selectedIds.length === 2
      ? "تلميذان"
      : `${selectedIds.length} تلاميذ`;

  return (
    <div className="relative flex flex-wrap items-center gap-2" dir="rtl">
      <select
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
        value={mode}
        onChange={(e) => applyMode(e.target.value as SelectionMode)}
      >
        <option value="batch">اختيار متعدد (بحث)</option>
        <option value="single">تلميذ واحد</option>
        <option value="level">حسب المستوى</option>
        <option value="all">أول {MAX_CARDS} تلميذًا</option>
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

      {(mode === "single" || mode === "batch") && (
        <input
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm w-48"
          placeholder="ابحث بالاسم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

      {mode === "single" && (
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm min-w-[200px]"
          value={selectedIds[0] || ""}
          onChange={(e) => handleSingleSelect(e.target.value)}
        >
          <option value="">اختر تلميذا</option>
          {results.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      )}

      {mode === "batch" && results.length > 0 && (
        <div className="w-full max-h-60 overflow-y-auto rounded-lg border bg-background shadow-sm p-1">
          {results.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => toggleStudent(s)}
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
