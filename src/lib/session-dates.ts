import { toDateInputValue } from "@/lib/group-form";

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC off-by-one). */
export function parseLocalYmd(value: unknown): Date | null {
  const s = toDateInputValue(value);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Format a Date as local YYYY-MM-DD (never use toISOString for calendar days). */
export function formatLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Inclusive last session day for a group:
 * - no custom expiresAt → school year end
 * - custom expiresAt before year end → group end (last day included)
 * - custom expiresAt on/after year end → school year end
 */
export function resolveGroupSessionEnd(
  yearEnd: Date,
  groupExpiresAt: unknown
): Date {
  const groupEnd = parseLocalYmd(groupExpiresAt);
  if (groupEnd && groupEnd.getTime() < yearEnd.getTime()) {
    return groupEnd;
  }
  return yearEnd;
}

/**
 * Old school-year end was copied onto every group as expiresAt.
 * A date shared by many groups is that leftover — not a real custom end.
 */
export function isLikelyBakedYearEnd(
  groupExpiresAt: unknown,
  yearEnd: unknown,
  allGroupEnds: unknown[]
): boolean {
  const e = toDateInputValue(groupExpiresAt);
  if (!e) return true;
  const ye = toDateInputValue(yearEnd);
  if (ye && e === ye) return true;
  const others = allGroupEnds.map(toDateInputValue).filter(Boolean) as string[];
  const same = others.filter((d) => d === e).length;
  if (same >= 3) return true;
  if (others.length >= 2 && same / others.length >= 0.5) return true;
  return false;
}

export function resolveGroupSessionRange(
  yearStartRaw: unknown,
  yearEndRaw: unknown,
  groupExpiresAt: unknown,
  opts?: { customEnd?: boolean }
): { start: Date; end: Date } | null {
  const start = parseLocalYmd(yearStartRaw);
  const yearEnd = parseLocalYmd(yearEndRaw);
  if (!start || !yearEnd) return null;
  const useCustom = opts?.customEnd !== false;
  const end = useCustom ? resolveGroupSessionEnd(yearEnd, groupExpiresAt) : yearEnd;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Prefer the later school-year end when settings and tenant disagree. */
export function pickLaterYmd(a: unknown, b: unknown): string | null {
  const da = toDateInputValue(a);
  const db = toDateInputValue(b);
  if (!da) return db || null;
  if (!db) return da;
  return da >= db ? da : db;
}

export function pickEarlierYmd(a: unknown, b: unknown): string | null {
  const da = toDateInputValue(a);
  const db = toDateInputValue(b);
  if (!da) return db || null;
  if (!db) return da;
  return da <= db ? da : db;
}
