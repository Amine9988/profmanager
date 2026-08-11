import { NextRequest, NextResponse } from "next/server";
import { getBarcodeSummary } from "@/server/actions/barcode";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBarcodeSummary(id);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}
