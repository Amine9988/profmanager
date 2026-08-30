import { NextResponse } from "next/server";
import { cashMovementStats } from "@/lib/db/aggregates";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    const stats = await cashMovementStats(tenantId);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
