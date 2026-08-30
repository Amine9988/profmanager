"use client";

import { Printer } from "@/lib/lucide";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  function handlePrint() {
    window.print();
  }

  return (
    <Button size="sm" onClick={handlePrint}>
      <Printer className="size-3.5 ml-1" /> طباعة
    </Button>
  );
}
