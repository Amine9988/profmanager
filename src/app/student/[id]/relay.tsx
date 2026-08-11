"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export function StudentRelay({ fullName }: { fullName: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 inset-x-0 z-50 flex justify-center px-4 print:hidden">
      <div className="flex items-center gap-3 rounded-2xl shadow-lg border px-4 py-3 max-w-sm w-full bg-white">
        <div className="size-10 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="size-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">تم إرسال: {fullName}</p>
          <p className="text-[11px] text-slate-500">البيانات ظهرت الآن على شاشة الحاسوب</p>
        </div>
        <button onClick={() => setVisible(false)} className="p-1 text-slate-400">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
