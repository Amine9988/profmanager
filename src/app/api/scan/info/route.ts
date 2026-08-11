import { NextRequest, NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

function collectIps(): { name: string; address: string }[] {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  return candidates;
}

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const port = host.match(/:(\d+)$/)?.[1] || "";
  const candidates = collectIps();

  // Priority order for the address the phone should use:
  // 1) USB tethering (Android 192.168.42.x, iPhone 172.20.10.x) — phone plugged in by cable, fully offline.
  // 2) Windows Mobile Hotspot (192.168.137.x) — phone connects to the computer directly.
  // 3) Any RFC1918 private LAN address (prefer over APIPA 169.254.x).
  const usb =
    candidates.find((c) => /^(192\.168\.42\.|172\.20\.10\.)/.test(c.address)) ||
    candidates.find((c) => /^192\.168\.4[0-9]\./.test(c.address)) ||
    candidates.find((c) => /^192\.168\.4[0-5]\./.test(c.address));
  const hotspot = candidates.find((c) => c.address.startsWith("192.168.137."));
  const lan = candidates.find((c) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address));
  const best = usb || hotspot || lan || candidates[0];

  const baseUrl = best ? `http://${best.address}${port ? `:${port}` : ""}` : host ? `http://${host}` : "";
  return NextResponse.json({
    baseUrl,
    addresses: candidates.map((c) => c.address),
    usb: !!usb,
    hotspot: !!hotspot,
  });
}
