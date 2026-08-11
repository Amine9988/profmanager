import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

function getTemplateDir(): string {
  const dbPath = process.env.LOCAL_DB_PATH || "";
  return dbPath ? path.dirname(dbPath) : path.join(process.cwd(), "data");
}

function getTemplatePath(): string {
  return path.join(getTemplateDir(), "certificate-template.docx");
}

function getLogoPath(): string {
  return path.join(getTemplateDir(), "certificate-logo.png");
}

export async function GET() {
  try {
    const dir = getTemplateDir();
    const tmplExists = fs.existsSync(getTemplatePath());
    const logoExists = fs.existsSync(getLogoPath());
    const logoSize = logoExists ? fs.statSync(getLogoPath()).size : 0;
    return NextResponse.json({ exists: tmplExists, logoExists, logoSize });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const logoFile = formData.get("logo") as File | null;

    if (file) {
      const tmplPath = getTemplatePath();
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(tmplPath, buffer);
    }

    if (logoFile) {
      const logoPath = getLogoPath();
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      fs.writeFileSync(logoPath, buffer);
    }

    if (!file && !logoFile) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("target") || "template";

    if (target === "template" || target === "all") {
      const tmplPath = getTemplatePath();
      if (fs.existsSync(tmplPath)) fs.unlinkSync(tmplPath);
    }
    if (target === "logo" || target === "all") {
      const logoPath = getLogoPath();
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
