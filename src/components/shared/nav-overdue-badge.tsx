'use client';

import { useEffect, useState } from 'react';

export function NavOverdueBadge() {
  const [overdue, setOverdue] = useState<number>(0);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch('/api/payments?aggregate=counts');
        if (!res.ok) return;
        const data = await res.json();
        setOverdue(Number(data.overdue) || 0);
      } catch {
        setOverdue(0);
      }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 120000);
    const onFocus = () => fetchCounts();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (overdue <= 0) return null;

  return (
    <span className="ml-auto flex items-center gap-1">
      <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
        {overdue > 99 ? '99+' : overdue}
      </span>
    </span>
  );
}
