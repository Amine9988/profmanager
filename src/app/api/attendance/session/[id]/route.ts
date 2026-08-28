import { NextRequest, NextResponse } from "next/server";
import { getSessionWithAttendance } from "@/server/actions/attendance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getSessionWithAttendance(id);
  if (!data) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(data);
}
