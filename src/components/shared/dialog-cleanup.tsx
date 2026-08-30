"use client";

import { useEffect } from "react";
import {
  forceUnlockUi,
  hasBlockingOverlay,
  isInsideOpenOverlay,
  isUiLocked,
  scheduleUnlock,
  unlockForField,
  unlockUi,
} from "@/lib/ui-unlock";

export {
  forceUnlockUi,
  hasBlockingOverlay,
  scheduleUnlock,
  unlockForField,
  unlockUi,
};

/**
 * App-wide watchdog: never leave the UI non-interactive after overlays close.
 * Mounted once from the root layout.
 */
export function DialogCleanup() {
  useEffect(() => {
    const tick = () => unlockUi();

    const observer = new MutationObserver(() => {
      queueMicrotask(tick);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "style",
        "inert",
        "aria-hidden",
        "data-scroll-locked",
        "class",
      ],
      childList: true,
      subtree: false,
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "inert", "aria-hidden", "data-pm-modal-open"],
    });

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (isInsideOpenOverlay(t)) return;
      if (isUiLocked() || hasBlockingOverlay()) {
        // Click outside any real modal → force clear ghosts + locks
        forceUnlockUi();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      unlockForField(e.target);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") scheduleUnlock(50);
      if (e.ctrlKey && e.shiftKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        forceUnlockUi();
      }
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable) &&
        !isInsideOpenOverlay(active)
      ) {
        if (isUiLocked()) forceUnlockUi();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        forceUnlockUi();
        scheduleUnlock(0);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);

    tick();
    const interval = setInterval(() => {
      if (isUiLocked()) forceUnlockUi();
      else unlockUi();
    }, 300);

    const api = { unlock: forceUnlockUi, soft: unlockUi };
    (window as unknown as { __pmUnlockUi?: () => void }).__pmUnlockUi = forceUnlockUi;
    (window as unknown as { __pmUi?: typeof api }).__pmUi = api;

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      clearInterval(interval);
      try {
        delete (window as unknown as { __pmUnlockUi?: () => void }).__pmUnlockUi;
        delete (window as unknown as { __pmUi?: typeof api }).__pmUi;
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
