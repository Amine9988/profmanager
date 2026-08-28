export function toDateInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

export function toSqlDate(value: unknown): string | null {
  const d = toDateInputValue(value);
  return d || null;
}

export function normalizeTime(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseDayOfWeek(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 0 || n > 6) return null;
  return n;
}

export type ParsedScheduleSlot = {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export function parseSlotsFromFormData(formData: FormData): {
  slots: ParsedScheduleSlot[];
  incomplete: boolean;
} {
  let slotCount = parseInt(String(formData.get("slotCount") || "0"), 10) || 0;
  // Fallback: if slotCount missing but slot_day_0 exists, count by scanning
  if (slotCount === 0) {
    // Scan up to 20 slots (reasonable upper bound) for any slot_day_N present
    for (let i = 0; i < 20; i++) {
      const hasDay = formData.get(`slot_day_${i}`) != null;
      const hasStart = formData.get(`slot_start_${i}`) != null;
      const hasEnd = formData.get(`slot_end_${i}`) != null;
      if (hasDay || hasStart || hasEnd) slotCount = Math.max(slotCount, i + 1);
    }
  }
  const slots: ParsedScheduleSlot[] = [];
  let incomplete = false;
  for (let i = 0; i < slotCount; i++) {
    const dayOfWeek = parseDayOfWeek(formData.get(`slot_day_${i}`));
    const startTime = normalizeTime(formData.get(`slot_start_${i}`));
    const endTime = normalizeTime(formData.get(`slot_end_${i}`));
    // Completely empty row (e.g., user added then removed via UI but count still high) -> skip silently
    if (dayOfWeek == null && !startTime && !endTime && !formData.get(`slot_id_${i}`)) {
      continue;
    }
    if (dayOfWeek == null || !startTime || !endTime) {
      incomplete = true;
      continue;
    }
    const id = String(formData.get(`slot_id_${i}`) || "").trim() || undefined;
    slots.push({ id, dayOfWeek, startTime, endTime });
  }
  return { slots, incomplete };
}
