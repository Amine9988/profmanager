"use client";

import { useCallback } from "react";
import { Printer, FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, ImageRun, AlignmentType } from "docx";
import type { StudentCardData, TenantCardData, CardTemplate } from "./types";
import { CARD_A7 } from "./types";
import { TEMPLATE_COLORS } from "./types";
import { generateQRCode } from "@/lib/qrcode-gen";
import { studentQrValue } from "@/lib/student-qr";

interface ExportActionsProps {
  students: StudentCardData[];
  tenant: TenantCardData;
  template: CardTemplate;
  cardRefs: React.RefObject<Map<string, HTMLDivElement | null>>;
}

const MM_TO_PX = 3.779;

export function ExportActions({ students, tenant, template, cardRefs }: ExportActionsProps) {
  const cardW = Math.round(CARD_A7.width * MM_TO_PX);
  const cardH = Math.round(CARD_A7.height * MM_TO_PX);

  const handlePrint = useCallback(() => {
    if (students.length === 0) return;
    const el = document.getElementById("sc-print-root");
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;

    const colors = TEMPLATE_COLORS[template];
    const items = students;
    const qrCache = new Map<string, string>();
    for (const s of items) {
      try { qrCache.set(s.id, generateQRCode(studentQrValue(s.id), 3)); } catch { qrCache.set(s.id, ""); }
    }

    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>بطاقات التلاميذ</title>
<style>
@page{size:A4 portrait;margin:8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#fff}
.page{width:190mm;height:281mm;display:grid;grid-template-columns:repeat(2,85mm);grid-template-rows:repeat(5,55mm);gap:1mm;padding:0;page-break-after:always;justify-content:center;align-content:center}
.card{width:85mm;height:55mm;border:1px solid #000;overflow:hidden;display:flex;flex-direction:column;background:#fff;padding:3mm}
.card-hdr{padding:2mm;margin:-3mm -3mm 2mm;display:flex;align-items:center;gap:2mm;background:${colors.primary};color:#fff}
.card-hdr span{font-size:7px;font-weight:700}
.card-body{flex:1;display:flex;flex-direction:column;gap:1mm;padding:0 1mm}
.card-name{font-size:10px;font-weight:700;color:${colors.text}}
.card-info{font-size:6.5px;line-height:1.4;color:${colors.text}}
.card-info span{color:${colors.primary};font-weight:600}
.card-info .colon{color:#99a1af;margin:0 1px}
.card-ft{padding:1.5mm 1mm 0;border-top:0.5px solid ${colors.secondary};margin:0 -1mm;display:flex;justify-content:center}
.card-ft svg{width:18mm;height:auto;display:block}
@media print{body{padding:0}}
</style></head><body>`);

    const pages: StudentCardData[][] = [];
    for (let i = 0; i < items.length; i += 10) pages.push(items.slice(i, i + 10));

    for (const page of pages) {
      w.document.write('<div class="page">');
      for (const s of page) {
        const qr = qrCache.get(s.id) || "";
        w.document.write(`<div class="card"><div class="card-hdr"><span>${tenant.name || "ProfManager"}</span></div><div class="card-body"><div class="card-name">${s.fullName}</div><div class="card-info"><span>المستوى</span><span class="colon">:</span> ${s.gradeLevel || "—"}<br><span>الهاتف</span><span class="colon">:</span> ${s.phone || "—"}</div></div><div class="card-ft">${qr}</div></div>`);
      }
      w.document.write("</div>");
    }

    w.document.write(`<script>window.onload=function(){setTimeout(function(){window.print();window.close()},500)};<\/script></body></html>`);
    w.document.close();
  }, [students, tenant, template]);

  const handleExportPDF = useCallback(async () => {
    if (students.length === 0) return;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 190;
    const perPage = 10;
    const cols = 2;
    const rows = 5;
    const cardWmm = 85;
    const cardHmm = 55;
    const gapH = 8;
    const gapV = 4;
    const xOff = (210 - (cols * cardWmm + gapH)) / 2;
    const yOff = (297 - (rows * cardHmm + (rows - 1) * gapV)) / 2;

    for (let i = 0; i < students.length; i += perPage) {
      if (i > 0) pdf.addPage();
      const batch = students.slice(i, i + perPage);
      for (let j = 0; j < batch.length; j++) {
        const s = batch[j];
        const col = j % cols;
        const row = Math.floor(j / cols);
        const x = xOff + col * (cardWmm + gapH);
        const y = yOff + row * (cardHmm + gapV);

        const el = document.getElementById("sc-card-" + s.id);
        if (!el) continue;

        try {
          const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
          const imgData = canvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", x, y, cardWmm, cardHmm);
        } catch {}
      }
    }
    pdf.save("بطاقات-التلاميذ.pdf");
  }, [students]);

  const handleExportDOCX = useCallback(async () => {
    if (students.length === 0) return;

    const sectionChildren: Paragraph[] = [];

    for (const s of students) {
      const el = document.getElementById("sc-card-" + s.id);
      if (!el) continue;
      let imgData: string | null = null;
      try {
        const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
        imgData = canvas.toDataURL("image/png");
      } catch {}

      sectionChildren.push(
        new Paragraph({
          children: [],
          spacing: { before: 200, after: 100 },
        })
      );

      if (imgData) {
        const imgBuffer = await fetch(imgData).then((r) => r.arrayBuffer());
        sectionChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: imgBuffer,
                transformation: { width: 400, height: 259 },
                type: "png",
              }),
            ],
          })
        );
      }

      sectionChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [{
            text: s.fullName,
            bold: true,
            size: 22,
            font: "Arial",
          } as any],
        })
      );
    }

    const doc = new Document({
      sections: [{ children: sectionChildren }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "بطاقات-التلاميذ.docx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [students, template]);

  if (students.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={handlePrint}>
        <Printer className="size-3.5 ml-1" /> طباعة
      </Button>
      <Button size="sm" variant="outline" onClick={handleExportPDF}>
        <FileDown className="size-3.5 ml-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={handleExportDOCX}>
        <FileText className="size-3.5 ml-1" /> DOCX
      </Button>
    </div>
  );
}
