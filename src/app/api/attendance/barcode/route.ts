import { NextRequest, NextResponse } from "next/server";
import { markAttendanceByBarcode } from "@/server/actions/barcode";

export async function POST(req: NextRequest) {
  const { sessionId, studentId } = await req.json();
  if (!sessionId || !studentId) {
    return NextResponse.json({ error: "missing sessionId or studentId" }, { status: 400 });
  }
  const result = await markAttendanceByBarcode(sessionId, studentId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
