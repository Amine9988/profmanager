"use client";

import { useRef, useState, useEffect } from "react";
import { Cable, PlugZap, Unplug } from "@/lib/lucide";
import { Button } from "@/components/ui/button";

interface Props {
  onScan: (line: string) => void;
}

export function SerialScanner({ onScan }: Props) {
  const portRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [baud, setBaud] = useState(() =>
    typeof window === "undefined" ? 115200 : Number(window.localStorage.getItem("pm-serial-baud") || "115200")
  );
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState("");
  const [log, setLog] = useState<{ t: string; s: string; ok: boolean }[]>([]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!(navigator as any).serial);
  }, []);

  if (!supported) return null;

  async function connect() {
    if (!(navigator as any).serial) return;
    setBusy(true);
    try {
      const port = await (navigator as any).serial.requestPort();
      portRef.current = port;
      localStorage.setItem("pm-serial-baud", String(baud));
      await port.open({ baudRate: baud });
      setConnected(true);
      setLog((l) => [{ t: new Date().toLocaleTimeString("ar-DZ"), s: "متصل ✔", ok: true }, ...l].slice(0, 40));
      listen(port);
    } catch (err) {
      setLog((l) => [{ t: new Date().toLocaleTimeString("ar-DZ"), s: "فشل الاتصال: " + String(err), ok: false }, ...l].slice(0, 40));
    } finally {
      setBusy(false);
    }
  }

  async function listen(port: any) {
    let buf = "";
    const decoder = new TextDecoder();
    try {
      while (port.readable) {
        const reader = port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            let s = "";
            try { s = decoder.decode(value, { stream: true }); } catch { s = ""; }
            setLive((p) => (p + s).slice(-120));
            buf += s;
            let idx: number;
            while ((idx = buf.search(/[\r\n]+/)) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (line) handleLine(line);
            }
          }
        } catch {}
        try { reader.releaseLock(); } catch {}
      }
    } finally {
      setConnected(false);
    }
  }

  function handleLine(raw: string) {
    setLog((l) => [{ t: new Date().toLocaleTimeString("ar-DZ"), s: raw.slice(0, 80), ok: true }, ...l].slice(0, 40));
    onScan(raw);
  }

  function disconnect() {
    try {
      const p = portRef.current;
      if (p) {
        setConnected(false);
        p.close();
      }
    } catch {}
  }

  if (!supported) return null;

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Cable className="size-4" />
          قارئ USB (وضع منفذ COM / Serial)
        </p>
        {connected ? (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={disconnect}>
            <Unplug className="size-4 mr-1" /> افصل
          </Button>
        ) : (
          <Button type="button" size="sm" className="h-8" onClick={connect} disabled={busy}>
            <PlugZap className="size-4 mr-1" />
            {busy ? "جارٍ الاتصال..." : "توصيل القارئ"}
          </Button>
        )}
      </div>
      {connected && (
        <p className="text-xs text-muted-foreground" dir="ltr">
          مستمع... {live ? `(آخر بايتات: ${live})` : "بانتظار المسح"}
        </p>
      )}
      {!connected && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>معدّل الباود:</span>
            {[9600, 19200, 38400, 115200].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBaud(b)}
                className={`h-6 px-2 rounded border text-[11px] ${baud === b ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold" : "border-input"}`}
              >
                {b}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            عادة تظهر أجهزة القراءة تحت اسم «USB-serial» أو «COM3». إذا لم يظهر أي منفذ في القائمة، فالقارئ في وضع كيبورد — استعمل المساران أعلاه.
          </p>
        </div>
      )}
      {log.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {log.map((x, i) => (
            <p key={i} dir="ltr" className={`font-mono text-[11px] truncate ${x.ok ? "text-foreground/80" : "text-destructive"}`}>
              [{x.t}] {x.s}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}