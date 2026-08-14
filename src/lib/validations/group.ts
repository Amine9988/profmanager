import { z } from "zod";

export const groupSchema = z.object({
  name: z.string().min(2, "Group name is required"),
  subjectId: z.string().uuid("Invalid subject").optional().nullable(),
  level: z.string().optional().nullable(),
  maxCapacity: z.coerce.number().int().min(1).max(100).default(10),
  pricePerSession: z.coerce.number().min(0).optional().nullable(),
  priceType: z.enum(["per_session", "monthly", "package"]).default("per_session"),
  sessionsIncluded: z.coerce.number().int().min(0).optional().nullable(),
  teacherId: z.string().uuid("Invalid teacher").optional().nullable(),
  roomId: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color").optional().nullable(),
});

export type GroupInput = z.infer<typeof groupSchema>;

export const scheduleSlotSchema = z.object({
  groupId: z.string().uuid(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "HH:MM format required"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "HH:MM format required"),
  location: z.string().optional().nullable(),
  isOnline: z.boolean().default(false),
});

export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>;
