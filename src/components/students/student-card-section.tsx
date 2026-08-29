"use client";

import { useRef, useEffect } from "react";
import { Printer, Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { generateQRCode } from "@/lib/qrcode-gen";
import { studentQrValue } from "@/lib/student-qr";

interface StudentCardSectionProps {
  student: {
    id: string;
    fullName: string;
    gradeLevel?: string | null;
    schoolName?: string | null;
  };
  tenant?: {
    name?: string | null;
    schoolPhone?: string | null;
    schoolLogo?: string | null;
  } | null;
}

function QRCode({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      try {
        const svg = generateQRCode(value, 4).replace(/width="[^"]*" height="[^"]*"/, `width="100%" height="auto"`);
        ref.current.innerHTML = svg;
      } catch {
        ref.current.innerHTML = "";
      }
    }
  }, [value]);
  return <div ref={ref} className="w-full" />;
}

export function StudentCardSection({ student, tenant }: StudentCardSectionProps) {
  const schoolName = tenant?.name || "ProfManager";
  const schoolPhone = tenant?.schoolPhone || null;
  const schoolLogo = tenant?.schoolLogo || "";

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    let qr = "";
    try { qr = generateQRCode(studentQrValue(student.id), 4); } catch {}
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>بطاقة - ${student.fullName}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{margin:0;padding:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;font-family:system-ui,sans-serif}
.card{width:85mm;height:55mm;border:1px solid #000;overflow:hidden;background:#fff;direction:rtl;display:flex;flex-direction:column;padding:2.5mm}
.hdr{display:flex;align-items:center;justify-content:space-between}
.hdr-sch{flex:1;min-width:0}
.logo{width:18px;height:18px;object-fit:contain;flex-shrink:0}
.sn{font-size:7px;font-weight:700;color:#1e293b;word-break:break-word;display:block;line-height:1.2}
.ln{height:1px;background:#000;margin:1mm 0}
.bd{display:flex;gap:2mm;flex:1;min-height:0}
.info{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.3mm;justify-content:center}
.rw{display:flex;font-size:6px;line-height:1.2}
.lb{flex-shrink:0;color:#64748b;font-weight:600;margin-left:1.5px}
.colon{flex-shrink:0;color:#99a1af;font-weight:600;margin:0 1px}
.vl{color:#1e293b;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ft{flex-shrink:0;padding-top:1mm;display:flex;justify-content:center}
.ft svg{width:22mm;height:auto;display:block}
@media print{@page{size:A4 landscape;margin:10mm}body{padding:0}}
</style></head><body>
<div class="card"><div class="hdr"><div class="hdr-sch"><span class="sn">${schoolName}</span></div>${schoolLogo ? `<img class="logo" src="${schoolLogo}" />` : ""}</div>
<div class="ln"></div>
<div class="bd"><div class="info">
<div class="rw"><span class="lb">الإسم واللقب</span><span class="colon">:</span><span class="vl">${student.fullName}</span></div>
<div class="rw"><span class="lb">المستوى</span><span class="colon">:</span><span class="vl">${student.gradeLevel || "غير محدد"}</span></div>
<div class="rw"><span class="lb">هاتف المدرسة</span><span class="colon">:</span><span class="vl">${schoolPhone || "غير محدد"}</span></div>
</div></div>
<div class="ft">${qr}</div>
</div>
<script>setTimeout(function(){window.print()},300)<\/script>
</body></html>`);
    w.document.close();
  }

  async function handleExportPDF() {
    const safeId = student.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const elId = "pdf-card-" + safeId;
    const bcId = "bc-" + safeId;

    let container: HTMLDivElement | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      container = document.createElement("div");
      container.id = elId;
      container.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;width:324px;height:204px;background:#fff;direction:rtl;overflow:hidden;pointer-events:none";
      fallbackTimer = setTimeout(() => container?.remove(), 5000);
      container.innerHTML = `
        <div style="padding:9.5px;display:flex;flex-direction:column;height:100%;box-sizing:border-box;font-family:system-ui,sans-serif;font-size:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:7.5px">
            <div style="font-size:7px;font-weight:700;color:#1e293b">${schoolName}</div>
            ${schoolLogo ? `<img src="${schoolLogo}" style="width:18px;height:18px;object-fit:contain;flex-shrink:0" />` : ""}
          </div>
          <div style="height:1px;background:#000;margin:3.7px 0"></div>
          <div style="display:flex;gap:7.5px;flex:1;min-height:0">
            <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:1px">
              <div style="display:flex;line-height:1.2"><span style="color:#64748b;font-weight:600;flex-shrink:0">الإسم واللقب</span><span style="color:#99a1af;font-weight:600;margin:0 1.5px;flex-shrink:0">:</span><span style="color:#1e293b;font-weight:500">${student.fullName}</span></div>
              <div style="display:flex;line-height:1.2"><span style="color:#64748b;font-weight:600;flex-shrink:0">المستوى</span><span style="color:#99a1af;font-weight:600;margin:0 1.5px;flex-shrink:0">:</span><span style="color:#1e293b;font-weight:500">${student.gradeLevel || "غير محدد"}</span></div>
              <div style="display:flex;line-height:1.2"><span style="color:#64748b;font-weight:600;flex-shrink:0">هاتف المدرسة</span><span style="color:#99a1af;font-weight:600;margin:0 1.5px;flex-shrink:0">:</span><span style="color:#1e293b;font-weight:500">${schoolPhone || "غير محدد"}</span></div>
            </div>
          </div>
          <div style="flex-shrink:0;padding-top:3.7px;display:flex;justify-content:center">
            <span id="${bcId}"></span>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      try {
        const qr = document.getElementById(bcId);
        if (qr) {
          qr.innerHTML = generateQRCode(studentQrValue(student.id), 4);
        }
      } catch (e) { console.error("QR error", e); }

      await new Promise(r => setTimeout(r, 300));

      const el = document.getElementById(elId);
      if (!el) throw new Error("Element not found");
      const canvas = await html2canvas(el, {
        scale: 4,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [85, 55],
      });
      pdf.addImage(imgData, "PNG", 0, 0, 85, 55);
      const filename = "بطاقة-" + student.fullName.replace(/\s+/g, "-").toUpperCase() + ".pdf";
      pdf.save(filename);
    } catch (e: any) {
      console.error("PDF export error:", e);
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (container && container.parentElement) container.remove();
      else {
        const el = document.getElementById(elId);
        if (el) el.remove();
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">بطاقة التلميذ</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileDown className="size-3.5 ml-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const a = document.createElement("a");
            a.href = `/api/students/${student.id}/card`;
            a.download = "";
            a.click();
          }}>
            <Download className="size-3.5 ml-1" /> تحميل
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="size-3.5 ml-1" /> طباعة
          </Button>
        </div>
      </div>
      <div className="sc-preview">
        <div className="sc-hdr">
          <div className="sc-school">
            <span className="sc-school-name">{schoolName}</span>
          </div>
          {schoolLogo && (
            <img src={schoolLogo} alt="شعار" className="sc-logo" />
          )}
        </div>
        <div className="sc-divider" />
        <div className="sc-body">
          <div className="sc-fields">
            <div className="sc-row">
              <span className="sc-label">الإسم واللقب</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{student.fullName}</span>
            </div>
            <div className="sc-row">
              <span className="sc-label">المستوى</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{student.gradeLevel || "غير محدد"}</span>
            </div>
            <div className="sc-row">
              <span className="sc-label">هاتف المدرسة</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{schoolPhone || "غير محدد"}</span>
            </div>
          </div>
        </div>
        <div className="sc-footer">
          <QRCode value={studentQrValue(student.id)} />
        </div>
      </div>

      <style>{`
        .sc-preview {
          width: 320px; border: 2px solid #333; border-radius: 8px;
          background: #fff; overflow: hidden; direction: rtl;
        }
        .sc-hdr { display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; }
        .sc-logo { width: 38px; height: 38px; object-fit: contain; flex-shrink: 0; }
        .sc-school { flex: 1; min-width: 0; }
        .sc-school-name { font-size: 12px; font-weight: 700; color: #1e293b; word-break: break-word; display: block; }
        .sc-divider { height: 2px; background: #333; margin: 0 10px 6px; }
        .sc-body { display: flex; gap: 10px; padding: 0 10px 8px; }
        .sc-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding-top: 1px; }
        .sc-row { display: flex; font-size: 10px; line-height: 1.3; }
        .sc-label { flex-shrink: 0; color: #64748b; font-weight: 600; margin-left: 3px; }
        .sc-colon { flex-shrink: 0; color: #99a1af; font-weight: 600; margin: 0 2px; }
        .sc-val { color: #1e293b; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc-footer { padding: 0 10px 8px; display: flex; justify-content: center; }
        .sc-footer :global(svg) { width: auto; height: auto; display: block; max-height: 60px; }
      `}</style>
    </div>
  );
}
