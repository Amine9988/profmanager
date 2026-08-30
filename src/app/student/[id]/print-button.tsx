"use client";

import { Printer } from "@/lib/lucide";

export function StudentPrintButton({ fullName }: { fullName: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
    >
      <Printer className="size-4" />
      طباعة البطاقة
    </button>
  );
}
