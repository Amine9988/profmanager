"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "@/lib/lucide";

type Student = { id: string; fullName: string };

export function StudentSearchSelect({
  value,
  onChange,
  placeholder = "ابحث عن تلميذ...",
  required,
}: {
  value: string;
  onChange: (id: string, name?: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    const params = new URLSearchParams({ status: "active", limit: "25", page: "1" });
    if (debounced) params.set("q", debounced);
    fetch(`/api/students?${params}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.data || [];
        setResults(list.map((s: any) => ({ id: s.id, fullName: s.fullName })));
      })
      .catch((e) => { if (e?.name !== "AbortError") setResults([]); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [open, debounced]);

  useEffect(() => {
    if (!value) { setLabel(""); return; }
    if (label) return;
    fetch(`/api/students?id=${encodeURIComponent(value)}&limit=1&page=1`)
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.data || [];
        const hit = list.find((s: any) => s.id === value);
        if (hit) setLabel(hit.fullName);
      })
      .catch(() => {});
  }, [value, label]);

  return (
    <div className="relative space-y-1">
      <input type="hidden" value={value} required={required} readOnly />
      <input
        className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
        placeholder={placeholder}
        value={open ? q : (label || q)}
        onFocus={() => { setOpen(true); setQ(label || ""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg">
          {loading && (
            <div className="flex justify-center py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">لا نتائج</p>
          )}
          {!loading && results.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full px-3 py-2 text-sm text-start hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.id, s.fullName);
                setLabel(s.fullName);
                setQ(s.fullName);
                setOpen(false);
              }}
            >
              {s.fullName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
