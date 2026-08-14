import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display state of the cumulative session counter. The paid pool grows with
 * every payment (packet size × number of paid payments) while the consumed
 * counter only ever increases as sessions finish. It turns red (exhausted)
 * only once consumed exceeds what was paid for.
 */
export function sessionCounterDisplay(
  sessionsIncluded: number | null | undefined,
  consumedSessions: number | null | undefined,
  paidSessions: number | null | undefined
):
  | { state: "hidden" }
  | { state: "none" }
  | { state: "counter"; consumed: number; paid: number; exhausted: boolean } {
  if (sessionsIncluded == null || Number(sessionsIncluded) <= 0) return { state: "hidden" };
  const paid = Math.max(Number(paidSessions ?? 0), 0);
  if (paid <= 0) return { state: "none" };
  const consumed = Math.max(Number(consumedSessions ?? 0), 0);
  return { state: "counter", consumed, paid, exhausted: consumed > paid };
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ar-DZ", { style: "currency", currency: "DZD", minimumFractionDigits: 2 }).format(amount);
}

/** YYYY-MM-DD of a date string, computed in the server's local timezone so a
 * payment stored as UTC midnight (`2026-08-13T23:00:00Z` for 2026-08-14 local)
 * never shows a day early. */
export function formatDateKey(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(
  date: Date | string,
  localeOrFormat: string | Intl.DateTimeFormatOptions = "fr-FR"
) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (typeof localeOrFormat === "object") {
    return new Intl.DateTimeFormat("fr-FR", localeOrFormat).format(d);
  }
  if (localeOrFormat === "MMM yyyy") {
    return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "short" }).format(d);
  }
  return new Intl.DateTimeFormat(localeOrFormat, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
