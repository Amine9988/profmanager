export type CardTemplate = "classic" | "modern" | "minimal" | "bold" | "elegant";

export type StudentCardData = {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  schoolName: string | null;
  phone: string | null;
  address: string | null;
  registrationNumber?: string;
};

export type TenantCardData = {
  name: string | null;
  schoolPhone: string | null;
  schoolLogo: string | null;
};

export type SelectionMode = "single" | "batch" | "class" | "level" | "all";

export type CardSize = {
  width: number;
  height: number;
  label: string;
};

export const CARD_A7: CardSize = { width: 85, height: 55, label: "A7" };
export const CARD_CR80: CardSize = { width: 85, height: 55, label: "CR80" };

export const TEMPLATES: { id: CardTemplate; label: string; description: string }[] = [
  { id: "classic", label: "كلاسيكي", description: "تصميم تقليدي أنيق" },
  { id: "modern", label: "حديث", description: "تصميم عصري بألوان جريئة" },
  { id: "minimal", label: "بسيط", description: "تصميم بسيط ونظيف" },
  { id: "bold", label: "قوي", description: "تصميم قوي بألوان داكنة" },
  { id: "elegant", label: "فاخر", description: "تصميم فاخر بألوان ذهبية" },
];

export const TEMPLATE_COLORS: Record<CardTemplate, { primary: string; secondary: string; accent: string; bg: string; text: string }> = {
  classic: { primary: "#1e40af", secondary: "#dbeafe", accent: "#3b82f6", bg: "#ffffff", text: "#1e293b" },
  modern: { primary: "#0891b2", secondary: "#cffafe", accent: "#06b6d4", bg: "#f0fdfa", text: "#0f172a" },
  minimal: { primary: "#475569", secondary: "#f1f5f9", accent: "#94a3b8", bg: "#ffffff", text: "#334155" },
  bold: { primary: "#1e293b", secondary: "#e2e8f0", accent: "#f59e0b", bg: "#f8fafc", text: "#0f172a" },
  elegant: { primary: "#92400e", secondary: "#fef3c7", accent: "#d97706", bg: "#fffbeb", text: "#451a03" },
};

export type ExportFormat = "pdf" | "docx" | "print";
