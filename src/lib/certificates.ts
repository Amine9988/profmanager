import path from "path";
import fs from "fs";
import JSZip from "jszip";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from "docx";
import { getTenantContext } from "@/lib/auth";

function getDataDir(): string {
  const dbPath = process.env.LOCAL_DB_PATH || "";
  return dbPath ? path.dirname(dbPath) : path.join(process.cwd(), "data");
}

function getTemplatePath(lang?: string): string {
  const dir = getDataDir();
  const bundled = path.join(process.cwd(), "data");
  const langFile =
    lang === "ar"
      ? "certificate-template-ar.docx"
      : lang === "en"
        ? "certificate-template-en.docx"
        : "certificate-template.docx";

  const candidates: string[] = [];
  if (lang === "ar" || lang === "en") {
    candidates.push(path.join(dir, langFile));
    candidates.push(path.join(bundled, langFile));
  }
  candidates.push(path.join(dir, "certificate-template.docx"));
  candidates.push(path.join(bundled, "certificate-template.docx"));

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function templateLangFor(cert: any): string | undefined {
  const t = (cert?.template as string) || "standard";
  if (t === "ar" || t === "en" || t === "fr") return t;
  return undefined;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function replaceDescriptionParagraph(docXml: string, anchor: string, newText: string): string {
  return docXml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (whole, inner) => {
    if (!inner.includes(anchor)) return whole;
    const pPr = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || "";
    const firstRun = inner.match(/<w:r\b[\s\S]*?<\/w:r>/)?.[0] || "";
    const rPr = firstRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || "";
    const run = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r>`;
    return whole.replace(inner, () => pPr + run);
  });
}

export async function generateFromTemplate(
  cert: any,
  student: any,
  settings: any,
  lang?: string
): Promise<Uint8Array> {
  const tmplPath = getTemplatePath(lang);
  if (!fs.existsSync(tmplPath)) throw new Error("Template not found");
  const buf = fs.readFileSync(tmplPath);
  const zip = await JSZip.loadAsync(buf);
  let meta: Record<string, string> = {};
  try { if (cert.metadata) meta = JSON.parse(cert.metadata); } catch {}
  const studentName = student.fullName || "?";
  const gradeLevel = student.gradeLevel || "";
  const desc = cert.description || meta.courseName || "";
  const issueDate = cert.issueDate
    ? new Date(cert.issueDate).toLocaleDateString("fr-DZ", {
        year: "numeric", month: "2-digit", day: "2-digit",
      })
    : "";
  const refId = cert.id ? cert.id.substring(0, 8).toUpperCase() : "000000";
  const directorName = settings?.directorName || "";
  const coachName = settings?.coachName || "";
  const schoolName = settings?.schoolName || student.schoolName || "";
  const replacements: Record<string, string> = {
    "[JJ/MM/AAAA]": issueDate,
    "[DD/MM/YYYY]": issueDate,
    "[XXXXXX]": refId,
    "[Nom et Prénom du stagiaire]": studentName,
    "[Trainee Full Name]": studentName,
    "[Nom du Coach]": coachName,
    "[Coach Name]": coachName,
    "[Nom du Directeur]": directorName,
    "[Director Name]": directorName,
  };
  const issueDateAr = cert.issueDate
    ? new Date(cert.issueDate).toLocaleDateString("ar-DZ", {
        year: "numeric", month: "2-digit", day: "2-digit",
      })
    : "";
  replacements["[يوم/شهر/سنة]"] = issueDateAr;
  replacements["[اسم ولقب المتدرب]"] = studentName;
  replacements["[اسم المدرب]"] = coachName;
  replacements["[المستوى]"] = gradeLevel;
  replacements["[Niveau]"] = gradeLevel;
  replacements["[Level]"] = gradeLevel;
  replacements["[اسم المدير]"] = directorName;
  let docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("word/document.xml not found in template");
  for (const [placeholder, value] of Object.entries(replacements)) {
    docXml = docXml.replaceAll(placeholder, value || "");
  }
  if (desc) {
    const anchors = ["إتمامًا", "Pour la réussite", "For successfully"];
    for (const anchor of anchors) {
      if (docXml.includes(anchor)) {
        docXml = replaceDescriptionParagraph(docXml, anchor, desc);
        break;
      }
    }
  }
  zip.file("word/document.xml", docXml);
  for (const fname of Object.keys(zip.files)) {
    if (fname.startsWith("word/header") || fname.startsWith("word/footer")) {
      let content = await zip.file(fname)?.async("string");
      if (content) {
        for (const [placeholder, value] of Object.entries(replacements)) {
          content = content.replaceAll(placeholder, value || "");
        }
        zip.file(fname, content);
      }
    }
  }
  const outBuf = await zip.generateAsync({ type: "uint8array" });
  return outBuf as unknown as Uint8Array;
}

export async function generateFallback(cert: any, student: any): Promise<Uint8Array> {
  const typeLabels: Record<string, string> = {
    enrollment: "شهادة تسجيل",
    attendance: "شهادة حضور",
    achievement: "شهادة تفوق",
    conduct: "شهادة سلوك",
  };
  const title = cert.title || typeLabels[cert.type] || "شهادة";
  const studentName = student.fullName || "?";
  const gradeLevel = student.gradeLevel || "";
  const schoolName = student.schoolName || "";
  const desc = cert.description || "";
  const issueDate = cert.issueDate
    ? new Date(cert.issueDate).toLocaleDateString("ar-DZ", {
        year: "numeric", month: "long", day: "numeric",
      })
    : "";
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1500, bottom: 1500, left: 1500, right: 1500 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", size: 20, font: "Traditional Arabic" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "وزارة التربية الوطنية", size: 20, font: "Traditional Arabic", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 } },
            children: [new TextRun({ text: schoolName || "مؤسسة تعليمية", size: 24, font: "Traditional Arabic", bold: true, color: "1a56db" })],
          }),
          new Paragraph({ spacing: { before: 400, after: 100 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            border: { top: { style: BorderStyle.DOUBLE, size: 6, space: 1 }, bottom: { style: BorderStyle.DOUBLE, size: 6, space: 1 } },
            children: [new TextRun({ text: title, size: 36, font: "Traditional Arabic", bold: true, color: "1e3a5f" })],
          }),
          new Paragraph({ spacing: { before: 300 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "يشهد مدير المؤسسة أن:", size: 22, font: "Traditional Arabic", color: "4b5563" })],
          }),
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: `الاسم واللقب: ${studentName}`, size: 28, font: "Traditional Arabic", bold: true, color: "000000" })],
          }),
          ...(gradeLevel ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: `المستوى: ${gradeLevel}`, size: 24, font: "Traditional Arabic", color: "374151" })],
          })] : []),
          new Paragraph({ spacing: { before: 200 } }),
          ...(desc ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: desc, size: 24, font: "Traditional Arabic", italics: true, color: "4b5563" })],
          })] : []),
          new Paragraph({ spacing: { before: 300 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "وذلك طوال السنة الدراسية", size: 22, font: "Traditional Arabic", color: "6b7280" })],
          }),
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "تحريراً في: ", size: 22, font: "Traditional Arabic", color: "6b7280" }),
              new TextRun({ text: issueDate, size: 22, font: "Traditional Arabic", bold: true, color: "374151" }),
            ],
          }),
          new Paragraph({ spacing: { before: 500 } }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: "إمضاء المدير", size: 22, font: "Traditional Arabic", color: "6b7280" })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: ".........................", size: 24, font: "Traditional Arabic", color: "9ca3af" })],
          }),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function generateDocx(cert: any, student: any, settings: any): Promise<Uint8Array> {
  const lang = templateLangFor(cert);
  const tmplPath = getTemplatePath(lang);
  if (fs.existsSync(tmplPath)) {
    return generateFromTemplate(cert, student, settings || {}, lang);
  }
  return generateFallback(cert, student);
}

export async function getCertificateWithStudent(id: string) {
  const { supabase, tenantId } = await getTenantContext();
  const { data: cert } = await supabase
    .from("certificates")
    .select("*, students(fullName, gradeLevel, schoolName, phone, email)")
    .eq("id", id)
    .eq("tenantId", tenantId)
    .single();
  if (!cert) throw new Error("Not found");
  const student = (cert as any).students || {};
  const { data: settings } = await supabase
    .from("certificate_settings")
    .select("*")
    .eq("tenantId", tenantId)
    .maybeSingle();
  return { cert, student, settings: settings || {} };
}

async function docxBodyContent(docxBuf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return "";
  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return "";
  return bodyMatch[1]
    .replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, "");
}

function addPageBreakBeforeFirstPara(body: string): string {
  // Find the first paragraph opening tag, e.g. <w:p ...>
  const m = body.match(/^(\s*)<w:p(\s[^>]*)?>/);
  if (!m) return body;
  const prefix = m[1];
  const attrs = m[2] || "";
  const rest = body.substring(m[0].length);

  // The first paragraph may already have a <w:pPr>; inject pageBreakBefore into it.
  const pPrMatch = rest.match(/^(\s*)<w:pPr>([\s\S]*?)<\/w:pPr>/);
  if (pPrMatch) {
    const injected = rest.replace(/^(\s*)<w:pPr>([\s\S]*?)<\/w:pPr>/,
      `$1<w:pPr><w:pageBreakBefore/>$2</w:pPr>`);
    return prefix + `<w:p${attrs}>` + injected;
  }

  // No pPr — add one.
  return prefix + `<w:p${attrs}><w:pPr><w:pageBreakBefore/></w:pPr>` + rest;
}

export async function generateBulkDocx(
  items: { cert: any; student: any }[],
  settings: any
): Promise<Uint8Array> {
  const docs = await Promise.all(
    items.map(({ cert, student }) => generateDocx(cert, student, settings))
  );
  if (docs.length === 0) throw new Error("No documents to merge");

  const base = await JSZip.loadAsync(docs[0]);
  let docXml = await base.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("word/document.xml not found");

  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) throw new Error("Invalid document body");

  const sectPrMatch = bodyMatch[1].match(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/);
  const sectPr = sectPrMatch ? sectPrMatch[0] : "";
  let mergedBody = bodyMatch[1].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, "");

  for (let i = 1; i < docs.length; i++) {
    const nextBody = await docxBodyContent(docs[i]);
    if (!nextBody) continue;
    const withBreak = addPageBreakBeforeFirstPara(nextBody);
    mergedBody += withBreak;
  }

  docXml = docXml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body>${mergedBody}${sectPr}</w:body>`
  );
  base.file("word/document.xml", docXml);
  const out = await base.generateAsync({ type: "uint8array" });
  return out as unknown as Uint8Array;
}

export async function getBulkCertificatesWithStudents(ids: string[]) {
  const { supabase, tenantId } = await getTenantContext();
  const { data: settings } = await supabase
    .from("certificate_settings")
    .select("*")
    .eq("tenantId", tenantId)
    .maybeSingle();
  const items: { cert: any; student: any }[] = [];
  for (const id of ids) {
    const { data: cert } = await supabase
      .from("certificates")
      .select("*, students(fullName, gradeLevel, schoolName, phone, email)")
      .eq("id", id)
      .eq("tenantId", tenantId)
      .single();
    if (!cert) continue;
    items.push({ cert, student: (cert as any).students || {} });
  }
  return { items, settings: settings || {} };
}
