"use client";

import { useEffect, useState } from "react";
import { generateQRCode } from "@/lib/qrcode-gen";
import { ensureLanBase } from "@/lib/scan-base";

export function PhoneScanQr({ mode = "lan" }: { mode?: "lan" | "usb" }) {
  const [base, setBase] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const b = await ensureLanBase();
      if (alive && b && !b.includes("localhost") && !b.includes("127.0.0.1")) setBase(b);
    };
    refresh();
    const t = setInterval(refresh, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (mode === "usb") setBase((prev) => prev);
  }, [mode]);

  if (!base) return null;

  const url = `${base}/scan-join`;
  let svg = "";
  try {
    svg = generateQRCode(url, 3);
  } catch {
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-center">
      <div
        className="mx-auto w-40 h-40 rounded-lg bg-white p-1"
        dangerouslySetInnerHTML={{ __html: svg.replace(/width="[^"]*" height="[^"]*"/, 'width="100%" height="auto"') }}
      />
    </div>
  );
}