"use server";

import { getOverdueSubscriptionsData } from "@/lib/payments/overdue";

export async function getOverdueSubscriptions() {
  return getOverdueSubscriptionsData();
}
