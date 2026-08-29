"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { BarcodeSummary } from "@/server/actions/barcode";
import { extractStudentIdFromQr } from "@/lib/student-qr";
import { getStudentAttendanceView } from "@/server/actions/attendance";
import { SummaryView } from "@/components/scan/summary-view";

interface HistoryItem {
  id: string;
  fullName: string;
  grade: string | null;
  ok: boolean;
  time: string;
}

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = ok ? "sine" : "square";
    osc.frequency.value = ok ? 1046 : 220;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.35 : 0.25));
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.35 : 0.25));
  } catch {}
}

function nowTime() {
  return new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Maps a physical key (e.code) to its US-layout characters [base, shifted].
// USB scanners emulate a US keyboard even when Windows runs a French/Arabic
// layout, so the interpreted e.key is garbled. Decoding from e.code makes the
// scanned value layout-independent.
const US_KEY_MAP: Record<string, [string, string]> = {
  Digit0: ["0", ")"], Digit1: ["1", "!"], Digit2: ["2", "@"], Digit3: ["3", "#"], Digit4: ["4", "$"],
  Digit5: ["5", "%"], Digit6: ["6", "^"], Digit7: ["7", "&"], Digit8: ["8", "*"], Digit9: ["9", "("],
  KeyA: ["a", "A"], KeyB: ["b", "B"], KeyC: ["c", "C"], KeyD: ["d", "D"], KeyE: ["e", "E"],
  KeyF: ["f", "F"], KeyG: ["g", "G"], KeyH: ["h", "H"], KeyI: ["i", "I"], KeyJ: ["j", "J"],
  KeyK: ["k", "K"], KeyL: ["l", "L"], KeyM: ["m", "M"], KeyN: ["n", "N"], KeyO: ["o", "O"],
  KeyP: ["p", "P"], KeyQ: ["q", "Q"], KeyR: ["r", "R"], KeyS: ["s", "S"], KeyT: ["t", "T"],
  KeyU: ["u", "U"], KeyV: ["v", "V"], KeyW: ["w", "W"], KeyX: ["x", "X"], KeyY: ["y", "Y"],
  KeyZ: ["z", "Z"],
  Minus: ["-", "_"], Equal: ["=", "+"], BracketLeft: ["[", "{"], BracketRight: ["]", "}"],
  Backslash: ["\\", "|"], Semicolon: [";", ":"], Quote: ["'", '"'], Backquote: ["`", "~"],
  Comma: [",", "<"], Period: [".", ">"], Slash: ["/", "?"], Space: [" ", " "],
  Numpad0: ["0", "0"], Numpad1: ["1", "1"], Numpad2: ["2", "2"], Numpad3: ["3", "3"], Numpad4: ["4", "4"],
  Numpad5: ["5", "5"], Numpad6: ["6", "6"], Numpad7: ["7", "7"], Numpad8: ["8", "8"], Numpad9: ["9", "9"],
  NumpadAdd: ["+", "+"], NumpadSubtract: ["-", "-"], NumpadMultiply: ["*", "*"], NumpadDivide: ["/", "/"],
  NumpadDecimal: [".", "."], NumpadEqual: ["=", "="],
};

function decodeKeyChar(e: KeyboardEvent): string | null | undefined {
  const m = US_KEY_MAP[e.code];
  if (m) {
    if (/^(Digit|Numpad)/.test(e.code)) {
      if (e.key && /[0-9]/.test(e.key)) return e.key;
      return m[0];
    }
    const k = e.key;
    if (k && k.length === 1 && /[a-zA-Z]/.test(k)) {
      if (/[a-fA-F]/.test(k)) return k.toLowerCase();
      const codeChar = (e.shiftKey ? m[1] : m[0]) as string;
      if (k.toLowerCase() === codeChar.toLowerCase()) return k.toLowerCase();
      return codeChar.toLowerCase();
    }
    return e.shiftKey ? m[1] : m[0];
  }
  if (e.key && e.key.length === 1) return garbleToUs(e.key);
  return undefined;
}

function garbleToUs(k: string): string | undefined {
  if (/^[0-9a-fA-F]$/.test(k) || k === "-") return k.toLowerCase();
  const G: Record<string, string> = {
    "à": "0", "&": "1", "é": "2", '"': "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return G[k];
}

export default function ScannerPage() {
  const [state, setState] = useState<"idle" | "loading" | "found" | "missing" | "error">("idle");
  const [buffer, setBuffer] = useState("");
  const [current, setCurrent] = useState<BarcodeSummary | null>(null);
  const [attView, setAttView] = useState<{ groups: any[]; sessions: any[]; roomById: Record<string, string> } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [keyEcho, setKeyEcho] = useState<string | null>(null);

  const bufRef = useRef("");
  const lastTsRef = useRef(0);
  const processingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const quietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processScan = useCallback(async (raw: string) => {
    const id = extractStudentIdFromQr(raw);
    setLastRead(raw);
    if (!id) return;
    if (processingRef.current) {
      pendingRef.current = raw;
      return;
    }
    processingRef.current = true;
    setState("loading");
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(id)}/barcode`);
      if (!res.ok) {
        setState("missing");
        setHistory((h) =>
          [{ id, fullName: raw.slice(0, 60), grade: null, ok: false, time: nowTime() }, ...h].slice(0, 12)
        );
        try {
          const log = JSON.parse(localStorage.getItem("pm-scan-log") || "[]");
          log.unshift({ t: Date.now(), raw, id });
          localStorage.setItem("pm-scan-log", JSON.stringify(log.slice(0, 40)));
        } catch {}
        beep(false);
        return;
      }
      const data: BarcodeSummary = await res.json();
      setCurrent(data);
      setCount((c) => c + 1);
      setState("found");
      setHistory((h) =>
        [
          { id: data.id, fullName: data.fullName, grade: data.gradeLevel, ok: true, time: nowTime() },
          ...h,
        ].slice(0, 12)
      );
      try {
        const v = await getStudentAttendanceView(id);
        setAttView(v);
      } catch {
        setAttView(null);
      }
      beep(true);
    } catch {
      setState("error");
      beep(false);
    } finally {
      processingRef.current = false;
      if (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        processScan(next);
      }
    }
  }, []);

  const submitBuffer = useCallback(() => {
    if (quietTimerRef.current) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
    const code = bufRef.current.trim();
    bufRef.current = "";
    lastTsRef.current = 0;
    setBuffer("");
    if (code) processScan(code);
  }, [processScan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typeof window !== "undefined" && window.location.pathname !== "/scanner") return;
      setKeyEcho(e.code + " / " + (typeof e.key === "string" && e.key.length === 1 ? e.key : "<" + e.key + ">"));
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter" || e.code === "NumpadEnter") {
        if (bufRef.current) e.preventDefault();
        submitBuffer();
        return;
      }

      const ch = decodeKeyChar(e);
      if (ch == null || ch === "") return;
      const now = Date.now();
      if (bufRef.current && now - lastTsRef.current > 500) {
        submitBuffer();
      }
      bufRef.current += ch;
      lastTsRef.current = now;
      setBuffer(bufRef.current);
      if (bufRef.current) e.preventDefault();

      if (quietTimerRef.current) clearTimeout(quietTimerRef.current);
      quietTimerRef.current = setTimeout(submitBuffer, 300);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (quietTimerRef.current) clearTimeout(quietTimerRef.current);
    };
  }, [processScan, submitBuffer]);

  useEffect(() => {
    const pollRef = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/poll?t=${Date.now()}`);
        const data = await res.json();
        if (data?.studentId) processScan(data.studentId);
      } catch {}
    }, 1500);
    return () => clearInterval(pollRef);
  }, [processScan]);

  async function handleMarkAttendance(sessionId: string) {
    if (!current) return;
    setAttendanceLoading(sessionId);
    try {
      const res = await fetch(`/api/attendance/barcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, studentId: current.id }),
      });
      if (!res.ok) {
        toast.error("فشل تسجيل الحضور");
        return;
      }
      toast.success("تم تسجيل الحضور بنجاح");
      processScan(current.id);
    } catch {
      toast.error("فشل تسجيل الحضور");
    } finally {
      setAttendanceLoading(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("scan") || params.get("demo");
    if (demo) {
      const t = setTimeout(() => processScan(demo), 300);
      return () => clearTimeout(t);
    }
  }, [processScan]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/scanner") return;
    const t1 = setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null;
      if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA" && !ae.isContentEditable)) {
        window.focus();
      }
    }, 300);
    const poll = setInterval(() => setFocused(document.hasFocus()), 1000);
    const onMouse = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (window.location.pathname !== "/scanner") return;
      window.focus();
      setFocused(true);
    };
    window.addEventListener("pointerdown", onMouse);
    return () => {
      clearTimeout(t1);
      clearInterval(poll);
      window.removeEventListener("pointerdown", onMouse);
    };
  }, []);

  return (
    <div className="flex flex-col items-center p-4 md:p-6 animate-fade-in" dir="rtl">
      <div className="w-full max-w-2xl space-y-5">
        {state !== "found" && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-3">
              {state === "idle" && (
                <>
                  <span className="relative flex size-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-4 rounded-full bg-emerald-500" />
                  </span>
                  <p className="text-lg font-bold text-emerald-600">في انتظار المسح...</p>
                  {buffer ? (
                    <p dir="ltr" className="font-mono text-xs text-muted-foreground break-all max-w-full px-4">
                      {buffer}
                    </p>
                  ) : lastRead ? (
                    <p dir="ltr" className="font-mono text-xs text-foreground/60 break-all max-w-full px-4">
                      آخر مسح: {lastRead}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">امسح البطاقة بالقارئ الآن</p>
                  )}
                  {keyEcho && (
                    <p dir="ltr" className="font-mono text-[11px] text-amber-600 break-all max-w-full px-4 border-t border-dashed pt-2">
                      سمعت: {keyEcho}
                    </p>
                  )}
                </>
              )}

              {state === "loading" && (
                <>
                  <span className="size-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="text-sm text-muted-foreground">جاري البحث عن التلميذ...</p>
                </>
              )}

              {state === "missing" && (
                <>
                  <XCircle className="size-12 text-destructive" />
                  <p className="text-lg font-bold text-destructive">لم يتم العثور على التلميذ</p>
                  <p className="text-xs text-muted-foreground">الرقم الذي قرئ: <b dir="ltr" className="font-mono break-all">{lastRead}</b></p>
                  <p className="text-xs text-muted-foreground">تحقق من البطاقة وحاول مجدداً</p>
                </>
              )}

              {state === "error" && (
                <>
                  <AlertTriangle className="size-12 text-destructive" />
                  <p className="text-lg font-bold text-destructive">خطأ في الاتصال</p>
                  <p className="text-xs text-muted-foreground">تأكد من أن التطبيق يعمل بشكل صحيح</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {state === "found" && current && (
          <SummaryView
            summary={current}
            attView={attView}
            attendanceLoading={attendanceLoading}
            onMarkAttendance={handleMarkAttendance}
          />
        )}
      </div>
    </div>
  );
}