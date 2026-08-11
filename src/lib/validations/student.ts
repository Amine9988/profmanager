import { z } from "zod";

export const studentSchema = z.object({
  fullName: z.string().min(2, "Full name is required (min 2 characters)"),
  dateOfBirth: z.string().optional().nullable(),
  gradeLevel: z.string().optional().nullable(),
  schoolName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  fatherPhone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  monthlyFee: z.coerce.number().min(0).default(0),
  subscriptionStart: z.string().optional().nullable(),
  billingType: z.enum(["monthly", "per_session"]).default("monthly"),
});

export type StudentInput = z.infer<typeof studentSchema>;
