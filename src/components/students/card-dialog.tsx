"use client";

import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { jsPDF } from "jspdf";
import { generateQRCode } from "@/lib/qrcode-gen";
import { studentQrValue } from "@/lib/student-qr";

type CardData = {
  student: { id: string; fullName: string; gradeLevel: string | null; schoolName: string | null };
  tenant: { name: string | null; schoolPhone: string | null; schoolLogo: string | null };
};

export function drawCardToCanvas(canvas: HTMLCanvasElement, s: CardData["student"], tenant: CardData["tenant"], studentId: string): Promise<void> {
  return new Promise(async (resolve) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return resolve();
  const W = 324, H = 204;
  const scale = 4;
  canvas.width = W * scale;
  canvas.height = H * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const schoolName = tenant?.name || "ProfManager";
  const phone = tenant?.schoolPhone || "";
  const logo = tenant?.schoolLogo || "";

  ctx.textBaseline = "top";

  // --- School name (RTL: right) ---
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(schoolName, W - 44, 16);

  // --- Divider ---
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(14, 70);
  ctx.lineTo(W - 14, 70);
  ctx.stroke();

  // --- Student info (right-aligned) ---
  ctx.textAlign = "right";
  const lines = [
    { label: "الإسم واللقب", value: s?.fullName || "" },
    { label: "المستوى", value: s?.gradeLevel || "غير محدد" },
    { label: "هاتف المدرسة", value: phone || "غير محدد" },
  ];
  let y = 82;
  for (const line of lines) {
    ctx.fillStyle = "#64748b";
    ctx.font = "600 12px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(line.label, W - 48, y);
    const lw = ctx.measureText(line.label).width;
    ctx.fillStyle = "#c0c7d1";
    ctx.font = "600 12px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(": ", W - 48 - lw - 8, y);
    ctx.fillStyle = "#1e293b";
    ctx.font = "500 12px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(line.value, W - 48 - lw - 16, y);
    y += 21;
  }

  let pending = 0;
  let done = false;
  const finish = () => {
    pending--;
    if (pending <= 0 && !done) { done = true; resolve(); }
  };

  // --- QR code (SVG rendered to canvas via Image) ---
  let qrSvg = "";
  try { qrSvg = generateQRCode(studentQrValue(studentId), 6); } catch {}
  if (qrSvg) {
    pending++;
    const img = new Image();
    img.onload = () => {
      try { ctx.drawImage(img, (W - 48) / 2, H - 14 - 48, 48, 48); } catch {}
      finish();
    };
    img.onerror = finish;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrSvg);
  }

  // --- School logo (top-left) ---
  if (logo) {
    pending++;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try { ctx.drawImage(img, 14, 12, 48, 48); } catch {}
      finish();
    };
    img.onerror = finish;
    img.src = logo;
  }

  if (pending === 0) resolve();
  });
}

export function CardDialog({ studentId }: { studentId: string }) {
  const t = useT();
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const generatingRef = useRef(false);

  useEffect(() => {
    if (!open || cardData) return;
    setLoading(true);
    setLoadError(false);
    setGenError(null);
    fetch(`/api/students/${studentId}/card`)
      .then((r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((data) => { setCardData(data); setLoading(false); })
      .catch(() => { setLoading(false); setLoadError(true); });
  }, [open, studentId, cardData]);

  const generatePdf = async () => {
    if (!cardData || generatingRef.current) return;
    generatingRef.current = true;
    setRendering(true);
    setGenError(null);
    try {
      await new Promise((r) => setTimeout(r, 200));
      const canvas = document.createElement("canvas");
      await drawCardToCanvas(canvas, cardData.student, cardData.tenant, studentId);
      const imgData = canvas.toDataURL("image/png");
      if (!imgData || imgData === "data:,") throw new Error("Canvas returned empty image");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [85, 55] });
      pdf.addImage(imgData, "PNG", 0, 0, 85, 55);
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (e: any) {
      console.error("PDF error:", e);
      setGenError(e?.message || "فشل توليد PDF");
    }
    setRendering(false);
  };

  useEffect(() => {
    if (cardData && !pdfBlobUrl && !generatingRef.current && !rendering) {
      generatePdf();
    }
  }, [cardData, pdfBlobUrl, rendering]);

  const s = cardData?.student;
  const tenant = cardData?.tenant;
  const school = tenant?.name || "ProfManager";
  const phone = tenant?.schoolPhone;

  const handlePrint = () => {
    if (!s) return;
    if (pdfBlobUrl) {
      const w = window.open(pdfBlobUrl, "_blank");
      if (w) { w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 1500); }
    }
  };

  const cardContent = s ? (
    <div dir="rtl" style={{ fontFamily: "'Segoe UI',Arial,sans-serif", width: "324px", padding: "9.5px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b" }}>{school}</div>
        {tenant?.schoolLogo && (
          <img src={tenant.schoolLogo} alt="شعار" style={{ width: "28px", height: "28px", objectFit: "contain" }} />
        )}
      </div>
      <div style={{ height: "1px", background: "#000", margin: "4px 0" }} />
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px", fontSize: "10px", lineHeight: 1.3 }}>
          <div style={{ display: "flex" }}><span style={{ color: "#64748b", fontWeight: 600, marginLeft: "3px", flexShrink: 0 }}>الإسم واللقب</span><span style={{ color: "#99a1af", fontWeight: 600, marginLeft: "3px", marginRight: "3px", flexShrink: 0 }}>:</span><span style={{ color: "#1e293b", fontWeight: 500 }}>{s.fullName}</span></div>
          <div style={{ display: "flex" }}><span style={{ color: "#64748b", fontWeight: 600, marginLeft: "3px", flexShrink: 0 }}>المستوى</span><span style={{ color: "#99a1af", fontWeight: 600, marginLeft: "3px", marginRight: "3px", flexShrink: 0 }}>:</span><span style={{ color: "#1e293b", fontWeight: 500 }}>{s.gradeLevel || "غير محدد"}</span></div>
          <div style={{ display: "flex" }}><span style={{ color: "#64748b", fontWeight: 600, marginLeft: "3px", flexShrink: 0 }}>هاتف المدرسة</span><span style={{ color: "#99a1af", fontWeight: 600, marginLeft: "3px", marginRight: "3px", flexShrink: 0 }}>:</span><span style={{ color: "#1e293b", fontWeight: 500 }}>{phone || "غير محدد"}</span></div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setLoadError(false);
        setGenError(null);
        if (!cardData) setLoading(true);
      } else {
        generatingRef.current = false;
        setGenError(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs">
          🖨️ {t("students.card_tab")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogTitle className="sr-only">بطاقة التلميذ</DialogTitle>
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold sr-only">بطاقة التلميذ</h2>
          {loading || rendering ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : pdfBlobUrl ? (
            <div className="rounded-lg border overflow-hidden bg-white" style={{ height: "70vh" }}>
              <iframe ref={iframeRef} src={pdfBlobUrl} className="w-full h-full" title="بطاقة التلميذ" />
            </div>
          ) : cardData ? (
            <div className="rounded-lg border overflow-hidden bg-white p-4">
              {cardContent}
              {genError && <p className="text-xs text-red-500 mt-2 text-center">{genError}</p>}
              <div className="flex justify-center gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => { generatingRef.current = false; setPdfBlobUrl(null); setGenError(null); setTimeout(() => generatePdf(), 100); }} className="gap-1">
                  {genError ? "إعادة المحاولة" : "توليد PDF"}
                </Button>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-[300px]">
              <p className="text-sm text-muted-foreground">خطأ في تحميل البطاقة</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
