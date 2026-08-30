/**
 * Permanent guard against Electron + Radix UI input freeze.
 * After Dialog/Select/Popover close, Radix can leave body with
 * pointer-events:none / inert / scroll-lock — blocking all typing until restart.
 */

const MODAL_ATTR = "data-pm-modal-open";

const OPEN_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="dialog-overlay"][data-state="open"]',
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]',
  '[data-radix-dialog-content][data-state="open"]',
  '[data-radix-select-content][data-state="open"]',
  '[role="dialog"][data-state="open"]',
  '[data-state="open"][role="listbox"]',
  '[data-state="open"][role="menu"]',
].join(", ");

/** Marks overlays this module hid, so the change can be undone and never re-applied. */
const NEUTRALIZED_ATTR = "data-pm-neutralized";

function isVisibleOpenOverlay(el: Element): boolean {
  const state = el.getAttribute("data-state");
  if (state !== "open") return false;

  const html = el as HTMLElement;
  const style = window.getComputedStyle(html);
  if (style.display === "none") return false;
  // Our own hiding must not be read back as proof the overlay is a ghost.
  if (style.visibility === "hidden" && !html.hasAttribute(NEUTRALIZED_ATTR)) return false;

  const rect = html.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return false;

  // pointer-events is deliberately not inspected: Radix sets `none` on the
  // lower layers of stacked dialogs and during the top layer's first frame.
  return true;
}

function neutralizeOverlay(html: HTMLElement): void {
  if (html.hasAttribute(NEUTRALIZED_ATTR)) return;
  html.setAttribute(NEUTRALIZED_ATTR, "1");
  html.style.setProperty("visibility", "hidden", "important");
}

function restoreOverlay(html: HTMLElement): void {
  if (!html.hasAttribute(NEUTRALIZED_ATTR)) return;
  html.removeAttribute(NEUTRALIZED_ATTR);
  html.style.removeProperty("visibility");
}

export function hasBlockingOverlay(): boolean {
  if (typeof document === "undefined") return false;
  for (const el of document.querySelectorAll(OPEN_OVERLAY_SELECTOR)) {
    if (isVisibleOpenOverlay(el)) return true;
  }
  // Popper wrappers that still host an open panel
  for (const el of document.querySelectorAll(
    '[data-radix-popper-content-wrapper] [data-state="open"]'
  )) {
    if (isVisibleOpenOverlay(el)) return true;
  }
  return false;
}

/** True if node is inside a currently open modal/select/popover panel. */
export function isInsideOpenOverlay(node: Element | null): boolean {
  if (!node || typeof document === "undefined") return false;
  const host = node.closest(
    [
      '[data-slot="dialog-content"][data-state="open"]',
      '[data-slot="select-content"][data-state="open"]',
      '[data-slot="popover-content"][data-state="open"]',
      '[role="dialog"][data-state="open"]',
      '[data-state="open"][role="listbox"]',
    ].join(", ")
  );
  return !!host && isVisibleOpenOverlay(host);
}

function syncModalFlag(open: boolean): void {
  const root = document.documentElement;
  if (open) {
    if (!root.hasAttribute(MODAL_ATTR)) root.setAttribute(MODAL_ATTR, "1");
  } else if (root.hasAttribute(MODAL_ATTR)) {
    root.removeAttribute(MODAL_ATTR);
  }
}

function neutralizeGhostOverlays(): void {
  // Anything claiming "open" but not actually visible → never intercept clicks.
  // `visibility: hidden` already removes the node from hit-testing, so
  // pointer-events is left to Radix (it owns it for stacked dialogs).
  for (const el of document.querySelectorAll(OPEN_OVERLAY_SELECTOR)) {
    const html = el as HTMLElement;
    if (isVisibleOpenOverlay(el)) restoreOverlay(html);
    else neutralizeOverlay(html);
  }

  for (const el of document.querySelectorAll(
    [
      '[data-slot="dialog-overlay"][data-state="closed"]',
      '[data-slot="dialog-content"][data-state="closed"]',
      '[data-slot="select-content"][data-state="closed"]',
      '[data-slot="popover-content"][data-state="closed"]',
      "[data-radix-dialog-overlay][data-state=closed]",
    ].join(", ")
  )) {
    (el as HTMLElement).style.pointerEvents = "none";
  }

  // Focus guards only make sense while a real overlay is on screen. Checking a
  // single arbitrary `[data-state="open"]` sibling used to drop them mid-dialog.
  if (!hasBlockingOverlay()) {
    for (const el of document.querySelectorAll("[data-radix-focus-guard]")) {
      try {
        el.remove();
      } catch {
        /* ignore */
      }
    }
  }
}

function clearScrollAndPointerLocks(): void {
  for (const el of [document.body, document.documentElement]) {
    el.style.removeProperty("pointer-events");
    el.style.pointerEvents = "";
    if (el.style.overflow === "hidden") el.style.removeProperty("overflow");
    if (el.style.paddingRight) el.style.removeProperty("padding-right");
    el.removeAttribute("data-scroll-locked");
    el.removeAttribute("inert");
    if (el.getAttribute("aria-hidden") === "true") el.removeAttribute("aria-hidden");
  }

  for (const el of document.querySelectorAll("[inert]")) {
    const node = el as HTMLElement;
    if (!isInsideOpenOverlay(node)) node.removeAttribute("inert");
  }

  // Restore anything Radix hideOthers hid (broad — stuck aria-hidden blocks typing)
  for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
    const node = el as HTMLElement;
    if (node.id === "sc-print-root") continue;
    if (isInsideOpenOverlay(node)) continue;
    // Skip elements that are intentionally decorative/closed overlays
    if (node.getAttribute("data-state") === "closed") continue;
    if (
      node.getAttribute("data-slot") === "dialog-overlay" ||
      node.getAttribute("data-slot") === "dialog-content"
    ) {
      continue;
    }
    node.removeAttribute("aria-hidden");
  }

  neutralizeGhostOverlays();
}

/** Hard unlock — used when user focuses a field outside any open overlay. */
export function forceUnlockUi(): void {
  if (typeof document === "undefined") return;
  neutralizeGhostOverlays();
  syncModalFlag(hasBlockingOverlay());
  if (!hasBlockingOverlay()) {
    clearScrollAndPointerLocks();
    syncModalFlag(false);
  }
}

/** Mark that a modal is intentionally open (call from Dialog/Select onOpenChange). */
export function markModalOpen(open: boolean): void {
  if (typeof document === "undefined") return;
  if (open) {
    syncModalFlag(true);
    return;
  }
  const finish = () => {
    neutralizeGhostOverlays();
    const still = hasBlockingOverlay();
    syncModalFlag(still);
    if (!still) clearScrollAndPointerLocks();
  };
  finish();
  setTimeout(finish, 0);
  setTimeout(finish, 100);
  setTimeout(finish, 320);
}

export function unlockUi(): void {
  if (typeof document === "undefined") return;
  neutralizeGhostOverlays();
  const blocked = hasBlockingOverlay();
  syncModalFlag(blocked);
  if (blocked) return;
  clearScrollAndPointerLocks();
}

export function scheduleUnlock(delay = 0): void {
  if (typeof window === "undefined") return;
  const run = () => unlockUi();
  setTimeout(run, delay);
  requestAnimationFrame(run);
  setTimeout(run, 50);
  setTimeout(run, 200);
  setTimeout(run, 400);
}

export function isUiLocked(): boolean {
  if (typeof document === "undefined") return false;
  const body = document.body;
  if (body.style.pointerEvents === "none") return true;
  if (body.hasAttribute("data-scroll-locked")) return true;
  if (body.hasAttribute("inert")) return true;
  if (document.documentElement.hasAttribute(MODAL_ATTR) && !hasBlockingOverlay()) {
    return true; // stale modal flag
  }
  try {
    if (window.getComputedStyle(body).pointerEvents === "none") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Call from inputs on focus — guarantees typing works. */
export function unlockForField(target: EventTarget | null): void {
  if (typeof document === "undefined") return;
  const el = target as Element | null;
  if (!el) {
    forceUnlockUi();
    return;
  }
  if (isInsideOpenOverlay(el)) {
    // Field is inside a real open dialog — only clear body if somehow locked wrongly
    // Dialog content has pointer-events:auto; still strip inert from ancestors outside overlay
    return;
  }
  // User is interacting with a normal page field → nothing should block them
  forceUnlockUi();
}
