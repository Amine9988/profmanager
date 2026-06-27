"use client";

import { useEffect, useState } from "react";

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  salaryType: string;
  salaryAmount: number;
}

interface TeacherSelectProps {
  value?: string;
  onChange: (teacherId: string) => void;
}

export function TeacherSelect({ value, onChange }: TeacherSelectProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTeachers() {
      try {
        const res = await fetch("/api/teachers");
        const data = await res.json();
        setTeachers(Array.isArray(data) ? data : data.data ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadTeachers();
  }, []);

  if (loading) {
    return (
      <select disabled className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-muted/50 px-3 py-1 text-sm shadow-sm">
        <option>Chargement...</option>
      </select>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all duration-200 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none"
    >
      <option value="">— Aucun enseignant —</option>
      {teachers.length === 0 && (
        <option disabled>Aucun enseignant enregistré</option>
      )}
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.firstName} {t.lastName}
        </option>
      ))}
    </select>
  );
}
