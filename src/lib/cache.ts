import { revalidatePath, refresh } from "next/cache";

/**
 * Revalidates ALL paths across the entire application after any mutation.
 * This ensures data consistency everywhere — no more stale data on any page.
 *
 * Call this from every Server Action after Create, Update, or Delete.
 */
export function revalidateFullApp() {
  revalidatePath("/", "layout");
  refresh();
}
