import { NextResponse } from "next/server";
import { pollScan } from "@/server/scan-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(pollScan());
}
