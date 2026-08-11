import { NextRequest, NextResponse } from "next/server";
import { submitScan } from "@/server/scan-sessions";

export async function POST(req: NextRequest) {
  let studentId = "";
  let fullName = "";
  try {
    const body = await req.json();
    studentId = String(body?.studentId || "").trim();
    fullName = String(body?.fullName || "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!studentId) {
    return NextResponse.json({ error: "missing_studentId" }, { status: 400 });
  }
  submitScan(studentId, fullName);
  return NextResponse.json({ ok: true });
}
