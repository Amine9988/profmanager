"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/shared/error-boundary";

export function PageShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case "F2": e.preventDefault(); router.push("/students"); break;
        case "F3": e.preventDefault(); router.push("/payments"); break;
        case "F4": e.preventDefault(); router.push("/attendance"); break;
        case "F5": e.preventDefault(); router.refresh(); break;
        case "F12": e.preventDefault(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
