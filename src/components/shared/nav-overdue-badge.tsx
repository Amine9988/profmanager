'use client';

import { useEffect, useState } from 'react';

export function NavOverdueBadge() {
  const [overdue, setOverdue] = useState<number>(0);
  const [partial, setPartial] = useState<number>(0);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [overdueRes, partialRes] = await Promise.all([
          fetch('/api/payments?status=overdue'),
          fetch('/api/payments?status=partial'),
        ]);
        if (overdueRes.ok) {
          const data = await overdueRes.json();
          setOverdue(data.length ?? 0);
        }
        if (partialRes.ok) {
          const data = await partialRes.json();
          setPartial(data.length ?? 0);
        }
      } catch {
        setOverdue(0);
        setPartial(0);
      }
    }
    fetchCounts();

    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const showOverdue = overdue > 0;
  const showPartial = partial > 0;

  if (!showOverdue && !showPartial) return null;

  return (
    <span className="ml-auto flex items-center gap-1">
      {showOverdue && (
        <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
          {overdue > 99 ? '99+' : overdue}
        </span>
      )}
      {showPartial && (
        <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
          {partial > 99 ? '99+' : partial}
        </span>
      )}
    </span>
  );
}
