let cached: string | null = null;

export type ScanMode = "lan" | "usb";

export type CardFormat = "code" | "url";

export function getCardFormat(): CardFormat {
  if (typeof localStorage !== "undefined") {
    try {
      if (localStorage.getItem("pm-card-format") === "code") return "code";
    } catch {}
  }
  return "url";
}

export function setCardFormat(format: CardFormat) {
  try {
    localStorage.setItem("pm-card-format", format);
  } catch {}
}

export function getScanMode(): ScanMode {
  if (typeof localStorage !== "undefined") {
    try {
      if (localStorage.getItem("pm-scan-mode") === "usb") return "usb";
    } catch {}
  }
  return "lan";
}

export function setScanMode(mode: ScanMode) {
  try {
    localStorage.setItem("pm-scan-mode", mode);
  } catch {}
  cached = null;
}

export async function ensureLanBase(): Promise<string | null> {
  try {
    const res = await fetch("/api/scan/info");
    const d = await res.json();
    const b = d?.baseUrl as string | null;
    if (b) {
      cached = b;
      try {
        localStorage.setItem("pm-lan-base", b);
      } catch {}
      return b;
    }
  } catch {}
  if (cached) return cached;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("pm-lan-base");
    if (stored) return stored;
  }
  return null;
}

export function qrBase(): string {
  if (cached) return cached;
  if (typeof localStorage !== "undefined") {
    const s = localStorage.getItem("pm-lan-base");
    if (s) return s;
  }
  if (getScanMode() === "usb") {
    const port = typeof window !== "undefined" ? window.location.port : "";
    return `http://localhost${port ? `:${port}` : ""}`;
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function isLocalBase(base: string): boolean {
  return /^(http:\/\/)?(localhost|127\.0\.0\.1)/.test(base);
}
