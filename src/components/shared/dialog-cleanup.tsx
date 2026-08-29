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
        '[data-radix-popper-content-wrapper]',
        '[data-state="open"][role="dialog"]',
      ].join(", ")
    )
  );
}

function unlockAll() {
  if (hasBlockingOverlay()) return;
  for (const el of [document.body, document.documentElement]) {
    if (el.style.pointerEvents === "none") el.style.removeProperty("pointer-events");
    if (el.style.overflow === "hidden") el.style.removeProperty("overflow");
    if (el.style.paddingRight) {
      // Radix adds padding-right for scrollbar compensation
      const pr = el.style.paddingRight;
      if (pr && parseInt(pr, 10) > 0) el.style.removeProperty("padding-right");
    }
    if (el.hasAttribute("data-scroll-locked")) el.removeAttribute("data-scroll-locked");
  }
  // Restore Radix-hidden siblings (main content)
  const main = document.querySelector("main, #__next, [data-radix-scroll-area-viewport], .flex.h-screen") as HTMLElement | null;
  if (main) {
    if (main.hasAttribute("inert") && !main.querySelector("[data-state='open']")) {
      main.removeAttribute("inert");
    }
    if (main.getAttribute("aria-hidden") === "true" && !document.querySelector('[aria-hidden="true"][data-state="open"]')) {
      // Only remove if no open dialog is intentionally hiding it
      // Check if main itself was hidden by Radix hideOthers
      if (!hasBlockingOverlay()) main.removeAttribute("aria-hidden");
    }
  }
  // Also clean any stale aria-hidden/inert on body children
  for (const el of document.querySelectorAll("[inert]")) {
    if (!el.closest('[data-state="open"]') && !hasBlockingOverlay()) (el as HTMLElement).removeAttribute("inert");
  }
  for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
    // Keep print root aria-hidden, but restore main
    if ((el as HTMLElement).id === "sc-print-root") continue;
    if (!el.closest('[data-state="open"]') && !hasBlockingOverlay() && el !== document.body && el !== document.documentElement) {
      // Only remove if it looks like Radix added it (direct child of body)
      if (el.parentElement === document.body) (el as HTMLElement).removeAttribute("aria-hidden");
    }
  }
}

export function DialogCleanup() {
  useEffect(() => {
    const observer = new MutationObserver(() => unlockAll());
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "inert", "aria-hidden", "data-scroll-locked"],
      subtree: false,
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "inert", "aria-hidden", "data-scroll-locked"],
    });
    // Also observe main for aria-hidden/inert
    const mainEl = document.querySelector("main");
    if (mainEl) observer.observe(mainEl, { attributes: true, attributeFilter: ["aria-hidden", "inert", "style"] });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimeout(unlockAll, 250);
    };
    const onFocusIn = () => {
      // If focus is on body while no overlay, try to unlock
      if (document.activeElement === document.body && !hasBlockingOverlay()) setTimeout(unlockAll, 50);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    unlockAll();
    const interval = setInterval(unlockAll, 1500);

    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      clearInterval(interval);
    };
  }, []);

  return null;
}
