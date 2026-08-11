"use server";

import { revalidatePath } from "next/cache";

export async function revalidateDashboard() {
  revalidatePath("/overview", "page");
  revalidatePath("/caisse", "page");
  revalidatePath("/payments", "page");
}
