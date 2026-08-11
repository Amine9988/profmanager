"use client";

import { Suspense, useRef, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Camera, Smartphone } from "lucide-react";
import { extractStudentIdFromQr } from "@/lib/student-qr";

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function ScanJoinInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const regionRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> | void } | null>(null);
  const [cameraMode, setCameraMode] = useState<"checking" | "on" | "off">("checking");
  const [lastSent, setLastSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (id: string) => {
    try {
      await fetch("/api/scan/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id }),
      });
    } catch {}
    beep();
    setLastSent(true);
    setTimeout(() => setLastSent(false), 1600);
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setCameraMode("on");
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!regionRef.current || scannerRef.current) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(regionRef.current.id);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await stopScanner();
          const m = extractStudentIdFromQr(decodedText);
          await submit(m);
          setTimeout(() => startScanner(), 1200);
        },
        () => {}
      );
    } catch (e: any) {
      if (scannerRef.current) scannerRef.current = null;
      setCameraMode("off");
      if (e?.name === "NotAllowedError") {
        setError("لم يُسمح بالوصول إلى الكاميرا");
      } else {
        setCameraMode("off");
      }
    }
  }, [submit, stopScanner]);

  useEffect(() => {
    const hasMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    if (!hasMedia) {
      setCameraMode("off");
    } else {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="p-4 flex items-center gap-3">
        <Smartphone className="size-5 text-emerald-400" />
        <div>
          <p className="font-bold text-sm">وضع المسح — أرسل إلى الحاسوب</p>
          <p className="text-[11px] text-slate-400">وجّه الكاميرا نحو بطاقة التلميذ</p>
        </div>
      </div>

      {cameraMode === "on" && (
        <div className="flex-1 relative">
          <div ref={regionRef} id="scan-join-region" className="w-full" />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-2 border-emerald-400/80 rounded-2xl mx-8 h-40 pointer-events-none" />
          <p className="py-3 text-center text-xs text-slate-400">أثبِت الهاتف ووجّه الكاميرا نحو QR البطاقة</p>
        </div>
      )}

      {cameraMode === "off" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
          <Camera className="size-10 text-slate-500" />
          <p className="text-sm text-slate-300 max-w-xs">
            كاميرا المتصفح غير متاحة على هذا الاتصال.
            <br />
            استخدم <b>كاميرا الهاتف الأصلية</b> لمسح بطاقة التلميذ — ستُرسل النتيجة إلى الحاسوب تلقائياً.
          </p>
          {error && <p className="text-xs text-amber-400">{error}</p>}
          {!token && <p className="text-xs text-slate-500">لا حاجة لرمز اقتران</p>}
        </div>
      )}

      {lastSent && (
        <div className="fixed inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 z-20">
          <CheckCircle2 className="size-14 text-emerald-400" />
          <p className="text-lg font-bold">تم الإرسال إلى الحاسوب</p>
        </div>
      )}
    </div>
  );
}

export default function ScanJoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <ScanJoinInner />
    </Suspense>
  );
}
