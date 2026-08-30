import { formatLocalYmd } from "@/lib/session-dates";

export interface ScheduleSlot {
  dayOfWeek?: number;
  day_of_week?: number;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
}

export interface GeneratedSession {
  date: string;
  startTime: string | null;
  endTime: string | null;
}

export function generateSessionDates(
  slots: ScheduleSlot[],
  startDate: Date,
  endDate: Date
): GeneratedSession[] {
  if (!slots || slots.length === 0) {
    return [];
  }

  const sessions: GeneratedSession[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  // Inclusive: sessions on the last day of the school year / group end
  while (current.getTime() <= end.getTime()) {
    const currentDay = current.getDay();

    for (const slot of slots) {
      const slotDay = slot.dayOfWeek ?? slot.day_of_week;
      const slotStart = slot.startTime ?? slot.start_time ?? null;
      const slotEnd = slot.endTime ?? slot.end_time ?? null;

      if (slotDay === currentDay) {
        sessions.push({
          date: formatLocalYmd(current),
          startTime: slotStart,
          endTime: slotEnd,
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return sessions;
}
