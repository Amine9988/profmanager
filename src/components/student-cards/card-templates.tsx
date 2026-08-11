"use client";

import { useRef, useEffect } from "react";
import { generateQRCode } from "@/lib/qrcode-gen";
import { studentQrValue } from "@/lib/student-qr";
import type { StudentCardData, TenantCardData, CardTemplate } from "./types";
import { TEMPLATE_COLORS } from "./types";

function QRCode({ value, size = 22 }: { value: string; size?: number }) {
  const svgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (svgRef.current) {
      try {
        const svg = generateQRCode(value, 2)
          .replace(/width="[^"]*" height="[^"]*"/, `width="${size}" height="${size}"`);
        svgRef.current.innerHTML = svg;
      } catch {
        svgRef.current.innerHTML = "";
      }
    }
  }, [value, size]);
  return <div ref={svgRef} style={{ width: size, height: size, flexShrink: 0 }} />;
}

const baseFont = "system-ui, -apple-system, sans-serif";

function ClassicTemplate({ student, tenant, colors }: { student: StudentCardData; tenant: TenantCardData; colors: { primary: string; secondary: string; accent: string; bg: string; text: string } }) {
  return (
    <div style={{ width: "100%", height: "100%", background: colors.bg, fontFamily: baseFont, direction: "rtl", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ background: colors.primary, padding: "3.5mm 3mm", display: "flex", alignItems: "center", gap: "2.5mm" }}>
        <div style={{ color: "#fff", fontSize: 8, fontWeight: 700, flex: 1, lineHeight: 1.2 }}>{tenant.name || "ProfManager"}</div>
      </div>
      <div style={{ flex: 1, padding: "2.5mm 3mm", display: "flex", flexDirection: "column", gap: "1mm" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: colors.text }}>{student.fullName}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1mm", fontSize: 6.5, lineHeight: 1.3 }}>
          <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 600 }}>Ø§Ù„Ù…Ø³ØªÙˆÙ‰</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text }}>{student.gradeLevel || "â€”"}</span></div>
          <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 600 }}>Ø§Ù„Ù‡Ø§ØªÙ</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text }}>{student.phone || "â€”"}</span></div>
        </div>
      </div>
      <div style={{ borderTop: `0.5px solid ${colors.secondary}`, padding: "1.5mm 3mm", display: "flex", gap: "2mm", alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}><QRCode value={studentQrValue(student.id)} size={76} /></div>
      </div>
    </div>
  );
}

function ModernTemplate({ student, tenant, colors }: { student: StudentCardData; tenant: TenantCardData; colors: { primary: string; secondary: string; accent: string; bg: string; text: string } }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", fontFamily: baseFont, direction: "rtl", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, padding: "3mm 3.5mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
          <div style={{ color: "#fff", fontSize: 8, fontWeight: 700, lineHeight: 1.2 }}>{tenant.name || "ProfManager"}</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: "2.5mm 3.5mm", display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.5mm" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.text, letterSpacing: 0.3 }}>{student.fullName}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8mm", fontSize: 6.5, lineHeight: 1.3 }}>
          <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 600 }}>Ø§Ù„Ù…Ø³ØªÙˆÙ‰</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text }}>{student.gradeLevel || "â€”"}</span></div>
          <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 600 }}>Ø§Ù„Ù‡Ø§ØªÙ</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text }}>{student.phone || "â€”"}</span></div>
          {student.address && <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 600 }}>Ø§Ù„Ø¹Ù†ÙˆØ§Ù†</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{student.address}</span></div>}
        </div>
      </div>
      <div style={{ background: colors.secondary, padding: "1.5mm 3.5mm", display: "flex", gap: "2mm", alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}><QRCode value={studentQrValue(student.id)} size={76} /></div>
      </div>
    </div>
  );
}

function MinimalTemplate({ student, tenant, colors }: { student: StudentCardData; tenant: TenantCardData; colors: { primary: string; secondary: string; accent: string; bg: string; text: string } }) {
  return (
    <div style={{ width: "100%", height: "100%", background: colors.bg, fontFamily: baseFont, direction: "rtl", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", padding: "3.5mm" }}>
      <div style={{ fontSize: 7, fontWeight: 600, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", marginBottom: "1.5mm" }}>{tenant.name || "ProfManager"}</div>
      <div style={{ height: 0.5, background: colors.accent, marginBottom: "2mm", opacity: 0.5 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.5mm" }}>
        <div style={{ fontSize: 10, fontWeight: 300, color: colors.text, letterSpacing: 0.5 }}>{student.fullName}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5mm", fontSize: 6.5, lineHeight: 1.3, color: colors.text }}>
          <div style={{ display: "flex", gap: 0.5 }}><span style={{ color: colors.primary, fontWeight: 500, width: 30 }}>Ø§Ù„Ù…Ø³ØªÙˆÙ‰</span><span style={{ color: "#99a1af", fontWeight: 600 }}>:</span><span>{student.gradeLevel || "â€”"}</span></div>
        </div>
      </div>
      <div style={{ marginTop: "1.5mm", display: "flex", justifyContent: "center" }}>
        <QRCode value={studentQrValue(student.id)} size={64} />
      </div>
    </div>
  );
}

function BoldTemplate({ student, tenant, colors }: { student: StudentCardData; tenant: TenantCardData; colors: { primary: string; secondary: string; accent: string; bg: string; text: string } }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", fontFamily: baseFont, direction: "rtl", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ background: colors.primary, padding: "2.5mm 3mm" }}>
        <div style={{ color: "#fff", fontSize: 8, fontWeight: 800, lineHeight: 1.2 }}>{tenant.name || "ProfManager"}</div>
      </div>
      <div style={{ flex: 1, padding: "2.5mm 3mm", display: "flex", flexDirection: "column", gap: "1mm", justifyContent: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: colors.primary, lineHeight: 1.2 }}>{student.fullName}</div>
        <div style={{ display: "flex", gap: "1.5mm", fontSize: 6.5, lineHeight: 1.3 }}>
          <div style={{ background: colors.secondary, padding: "0.5mm 1.5mm", borderRadius: 1, display: "flex", gap: 0.5 }}>
            <span style={{ color: colors.accent, fontWeight: 700 }}>{student.gradeLevel || "â€”"}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3mm", fontSize: 6, color: colors.text, lineHeight: 1.3 }}>
          <div><span style={{ fontWeight: 600, color: colors.primary }}>Ø§Ù„Ù‡Ø§ØªÙ</span><span style={{ color: "#99a1af", fontWeight: 600, margin: "0 1px" }}>:</span><span style={{ color: colors.text }}>{student.phone || "â€”"}</span></div>
        </div>
      </div>
      <div style={{ background: colors.secondary, padding: "1.5mm 3mm", display: "flex", gap: "2mm", alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}><QRCode value={studentQrValue(student.id)} size={76} /></div>
      </div>
    </div>
  );
}

function ElegantTemplate({ student, tenant, colors }: { student: StudentCardData; tenant: TenantCardData; colors: { primary: string; secondary: string; accent: string; bg: string; text: string } }) {
  return (
    <div style={{ width: "100%", height: "100%", background: colors.bg, fontFamily: baseFont, direction: "rtl", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", border: `0.5px solid ${colors.accent}` }}>
      <div style={{ padding: "2.5mm 3mm", borderBottom: `0.5px solid ${colors.secondary}`, display: "flex", alignItems: "center", gap: "2mm" }}>
        <div style={{ fontSize: 7, fontWeight: 600, color: colors.primary, letterSpacing: 0.5 }}>{tenant.name || "ProfManager"}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 5, color: colors.accent }}>{new Date().getFullYear()}</div>
      </div>
      <div style={{ flex: 1, padding: "2.5mm 3mm", display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.5mm" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.primary, textAlign: "center" }}>{student.fullName}</div>
        <div style={{ height: 0.5, background: colors.accent, width: "60%", margin: "0 auto", opacity: 0.4 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5mm", fontSize: 6.5, lineHeight: 1.3, color: colors.text }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: colors.accent, fontWeight: 600 }}>Ø§Ù„Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø¯Ø±Ø§Ø³ÙŠ</span>
            <span style={{ fontWeight: 500 }}>{student.gradeLevel || "â€”"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: colors.accent, fontWeight: 600 }}>Ø§Ù„Ù‡Ø§ØªÙ</span>
            <span style={{ fontWeight: 500 }}>{student.phone || "â€”"}</span>
          </div>
        </div>
      </div>
      <div style={{ borderTop: `0.5px solid ${colors.secondary}`, padding: "1.5mm 3mm", display: "flex", justifyContent: "center" }}>
        <QRCode value={studentQrValue(student.id)} size={76} />
      </div>
    </div>
  );
}

const TEMPLATE_MAP: Record<CardTemplate, typeof ClassicTemplate> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  minimal: MinimalTemplate,
  bold: BoldTemplate,
  elegant: ElegantTemplate,
};

export function CardRenderer({
  student, tenant, template, width, height,
}: {
  student: StudentCardData;
  tenant: TenantCardData;
  template: CardTemplate;
  width: number;
  height: number;
}) {
  const colors = TEMPLATE_COLORS[template];
  const Tmpl = TEMPLATE_MAP[template];
  return (
    <div style={{ width, height, flexShrink: 0 }}>
      <Tmpl student={student} tenant={tenant} colors={colors} />
    </div>
  );
}
