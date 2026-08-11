import { qrBase, getCardFormat, isLocalBase } from "./scan-base";

export function studentQrValue(studentId: string): string {
  if (getCardFormat() === "code") return studentId;
  const base = qrBase();
  if (!base || isLocalBase(base)) return studentId;
  return `${base}/student/${studentId}`;
}

const UUID_RE = /(?<![0-9a-fA-F-])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9a-fA-F])/;
const HEX32_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/;

export function extractStudentIdFromQr(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const urlMatch = raw.match(/\/student\/[0-9a-fA-F-]{8,}/i);
  if (urlMatch) {
    const after = urlMatch[0].slice(9);
    if (/^[0-9a-fA-F]{12,}$/.test(after.replace(/-/g, ""))) return after.toLowerCase();
  }
  const uuid = raw.match(UUID_RE);
  if (uuid) return uuid[0].toLowerCase();
  const hex32 = raw.match(HEX32_RE);
  if (hex32) {
    const h = hex32[0].toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return raw;
}
