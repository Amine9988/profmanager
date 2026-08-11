import { NextRequest } from "next/server";
import { generateDocx, getCertificateWithStudent } from "@/lib/certificates";
import { isWordInstalled, convertDocxToPdfViaWord } from "@/lib/docx-to-pdf";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  enrollment: "شهادة تسجيل",
  attendance: "شهادة حضور",
  achievement: "شهادة تفوق",
  conduct: "شهادة سلوك",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isWordInstalled()) {
      return Response.json(
        { error: "Microsoft Word n'est pas installé. Veuillez installer Microsoft Word pour générer des PDF, ou utilisez le téléchargement DOCX à la place." },
        { status: 400 }
      );
    }

    const { id } = await params;
    const { cert, student, settings } = await getCertificateWithStudent(id);

    const docxBuffer = await generateDocx(cert, student, settings);

    const pdfBuffer = convertDocxToPdfViaWord(Buffer.from(docxBuffer));

    const title = (cert as any).title || typeLabels[(cert as any).type as string] || "شهادة";
    const studentName = student.fullName || "?";
    const filename = `${encodeURIComponent(title.replace(/\s+/g, "_"))}_${encodeURIComponent(studentName)}.pdf`;

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    // Return full error details — never hide behind a generic message
    const stack = e.stack || "";
    const stderr = e.stderr ? e.stderr.toString() : "";
    const stdout = e.stdout ? e.stdout.toString() : "";
    return Response.json(
      {
        error: e.message || "Erreur inconnue lors de la génération du PDF",
        stack,
        stderr,
        stdout,
      },
      { status: 500 }
    );
  }
}
