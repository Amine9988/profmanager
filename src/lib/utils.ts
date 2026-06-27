import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ar-DZ", { style: "currency", currency: "DZD", minimumFractionDigits: 2 }).format(amount);
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
