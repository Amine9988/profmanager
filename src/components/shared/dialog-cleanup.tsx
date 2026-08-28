"use client";

import { useEffect } from "react";

function hasBlockingOverlay() {
  return Boolean(
    document.querySelector(
      [
        '[data-slot="dialog-content"][data-state="open"]',
        '[data-slot="dialog-overlay"][data-state="open"]',
        '[data-slot="select-content"][data-state="open"]',
        '[data-radix-dialog-content][data-state="open"]',
        '[data-radix-select-content][data-state="open"]',
        '[role="dialog"][data-state="open"]',
      ].join(", ")
    )
  );
}

function unlockPointerEvents() {
  if (hasBlockingOverlay()) return;
  for (const el of [document.body, document.documentElement]) {
    if (el.style.pointerEvents === "none") {
      el.style.removeProperty("pointer-events");
    }
  }
}

export function DialogCleanup() {
  useEffect(() => {
    const observer = new MutationObserver(() => unlockPointerEvents());
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimeout(unlockPointerEvents, 250);
    };
    window.addEventListener("keydown", onKey);
    unlockPointerEvents();
    const interval = setInterval(unlockPointerEvents, 1500);

    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
      clearInterval(interval);
    };
  }, []);

  return null;
}
