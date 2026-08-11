import { NextRequest } from "next/server";
import { generateBulkDocx, getBulkCertificatesWithStudents } from "@/lib/certificates";
import { isWordInstalled, convertDocxToPdfViaWord } from "@/lib/docx-to-pdf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isWordInstalled()) {
      return Response.json(
        { error: "Microsoft Word n'est pas installé. Veuillez installer Microsoft Word pour générer des PDF, ou utilisez le téléchargement DOCX à la place." },
        { status: 400 }
      );
    }

    let ids: string[] = [];
    try {
      const body = await req.json();
      ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
    } catch {}

    if (ids.length === 0) {
      return Response.json({ error: "No certificates selected" }, { status: 400 });
    }

    const { items, settings } = await getBulkCertificatesWithStudents(ids);
    if (items.length === 0) {
      return Response.json({ error: "No certificates found" }, { status: 404 });
    }

    const docxBuffer = await generateBulkDocx(items, settings);
    const pdfBuffer = convertDocxToPdfViaWord(Buffer.from(docxBuffer));

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="attestations_${items.length}.pdf"`,
      },
    });
  } catch (e: any) {
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
