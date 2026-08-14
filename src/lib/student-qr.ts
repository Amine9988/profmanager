import { qrBase, getCardFormat, isLocalBase } from "./scan-base";

export function studentQrValue(studentId: string): string {
  if (getCardFormat() === "code") return studentId;
  const base = qrBase();
  if (!base || isLocalBase(base)) return studentId;
  return `${base}/student/${studentId}`;
}

const UUID_RE = /(?<![0-9a-fA-F-])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9a-fA-F])/;
const HEX32_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/;

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

function insertDashes32(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * USB/phone barcode readers emulate a keyboard. With a French/Arabic layout the
 * URL characters get substituted ("-" -> "6", "/" -> ">", "." -> "<", ":" -> "."),
 * so "http://…/student/8abc-1234-…" arrives as "http.>>…>student>8abc61234…".
 * This repairs the trailing student id back into a real dashed UUID.
 */
export function repairStudentId(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";

  // 1. Clean URL (camera scan) or plain code.
  const uuid = raw.match(UUID_RE);
  if (uuid) return uuid[0].toLowerCase();

  // 2. Isolate the trailing token after the "student" marker, whatever the
  //    keyboard layout did to the "/student/" separators.
  let tail = "";
  const marker = raw.toLowerCase().match(/student[^0-9a-f]*/);
  if (marker) {
    tail = raw.slice((marker.index || 0) + marker[0].length);
  }

  // 3. Pull the longest hex run from that tail (dashes may have been dropped
  //    entirely or replaced by a hex digit, so keep [0-9a-f] and also "-").
  const hexish = (tail || raw).match(/[0-9a-fA-F-]{24,}/);
  const token = hexish ? hexish[0] : "";

  // 4. Reconstruct the UUID from the 32 or 36 hex form.
  if (token) {
    const hex = token.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
    if (hex.length === 32) {
      return insertDashes32(hex);
    }
    if (hex.length === 36) {
      // Keyboard garble kept the exact length but turned each "-" into a hex
      // digit. Dash slots in a UUID are fixed: 8,13,18,23.
      const rebuilt = `${token.slice(0, 8)}-${token.slice(9, 13)}-${token.slice(14, 18)}-${token.slice(19, 23)}-${token.slice(24, 36)}`;
      const candidate = rebuilt.replace(/[^0-9a-fA-F-]/g, "").toLowerCase();
      if (isUuidLike(candidate)) return candidate;
      // Also try: 36 hex digits with every 5th-group dash (in case the reader
      // duplicated a dash character instead of dropping it).
      const stripped36 = token.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
      if (stripped36.length === 36) {
        const alt = `${stripped36.slice(0, 8)}-${stripped36.slice(9, 13)}-${stripped36.slice(14, 18)}-${stripped36.slice(19, 23)}-${stripped36.slice(24, 36)}`;
        if (isUuidLike(alt)) return alt;
      }
    }
  }

  // 5. A bare 32-hex token anywhere (no "student" marker).
  const hex32 = raw.match(HEX32_RE);
  if (hex32) return insertDashes32(hex32[0].toLowerCase());

  return raw;
}

export function extractStudentIdFromQr(input: string): string {
  return repairStudentId(input);
}
