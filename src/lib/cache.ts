import { revalidatePath, refresh } from "next/cache";

/**
 * Revalidates ALL paths across the entire application after any mutation.
 * This ensures data consistency everywhere — no more stale data on any page.
 *
 * Call this from every Server Action after Create, Update, or Delete.
 * `refresh()` is only valid within a Server Action; it is wrapped in try/catch
 * so this helper stays safe when invoked indirectly from Route Handlers.
 */
export function revalidateFullApp() {
  revalidatePath("/", "layout");
  try {
    refresh();
  } catch {
    // refresh() is only available within Server Actions
  }
}
