import { NextRequest } from "next/server";
import { generateDocx, getCertificateWithStudent } from "@/lib/certificates";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { cert, student, settings } = await getCertificateWithStudent(id);

    const buffer = await generateDocx(cert, student, settings);

    const typeLabels: Record<string, string> = {
      enrollment: "شهادة تسجيل",
      attendance: "شهادة حضور",
      achievement: "شهادة تفوق",
      conduct: "شهادة سلوك",
    };
    const title =
      (cert as any).title || typeLabels[(cert as any).type as string] || "شهادة";
    const studentName = student.fullName || "?";
    const filename = `${encodeURIComponent(title.replace(/\s+/g, "_"))}_${encodeURIComponent(studentName)}.docx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
