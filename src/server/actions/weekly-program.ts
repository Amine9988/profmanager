import { getTenantContext } from "@/lib/auth";
import { toCamelArray, toCamelCase } from "@/lib/db";

export interface WeeklySlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
  isOnline: boolean;
  group: {
    id: string;
    name: string;
    level: string | null;
    subject: { id: string; name: string; color: string } | null;
    teacher: { id: string; firstName: string; lastName: string } | null;
    room: { id: string; name: string } | null;
    studentCount: number;
    maxCapacity: number | null;
  };
}

export interface WeeklyProgramData {
  slots: WeeklySlot[];
  teachers: { id: string; firstName: string; lastName: string }[];
  subjects: { id: string; name: string; color: string }[];
  rooms: { id: string; name: string }[];
}

export async function getWeeklyProgram(): Promise<WeeklyProgramData> {
  const { tenantId, supabase } = await getTenantContext();

  const { data: groups } = await supabase
    .from("groups")
    .select("*, subjects(*), teachers(id, firstName, lastName), rooms(id, name), group_students(*), schedule_slots(*)")
    .eq("tenantId", tenantId)
    .eq("status", "active");

  const groupsList = toCamelArray(groups || []);
  const slots: WeeklySlot[] = [];
  const teacherSet = new Set<string>();
  const subjectSet = new Set<string>();
  const roomSet = new Set<string>();
  const teachers: any[] = [];
  const subjects: any[] = [];
  const rooms: any[] = [];

  for (const g of groupsList) {
    const rawSlots = Array.isArray(g.scheduleSlots) ? g.scheduleSlots : (g.scheduleSlots ? [g.scheduleSlots] : []);
    const groupSlots = toCamelArray(rawSlots);
    const activeStudents = (g.groupStudents || []).filter((gs: any) => gs.status === "active");
    const studentCount = activeStudents.length;

    if (g.subjects && !subjectSet.has(g.subjects.id)) {
      subjectSet.add(g.subjects.id);
      subjects.push(g.subjects);
    }
    if (g.teachers && !teacherSet.has(g.teachers.id)) {
      teacherSet.add(g.teachers.id);
      teachers.push(g.teachers);
    }
    if (g.rooms && !roomSet.has(g.rooms.id)) {
      roomSet.add(g.rooms.id);
      rooms.push(g.rooms);
    }

    for (const s of groupSlots) {
      slots.push({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location ?? null,
        isOnline: !!s.isOnline,
        group: {
          id: g.id,
          name: g.name,
          level: g.level ?? null,
          subject: g.subjects ? { id: g.subjects.id, name: g.subjects.name, color: g.subjects.color } : null,
          teacher: g.teachers ? { id: g.teachers.id, firstName: g.teachers.firstName, lastName: g.teachers.lastName } : null,
          room: g.rooms ? { id: g.rooms.id, name: g.rooms.name } : null,
          studentCount,
          maxCapacity: g.maxCapacity ?? null,
        },
      });
    }
  }

  slots.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  return { slots, teachers, subjects, rooms };
}
