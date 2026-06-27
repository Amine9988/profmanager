'use client';

import { useEffect, useState } from 'react';

export function NavOverdueBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function fetchOverdue() {
      try {
        const res = await fetch('/api/payments?status=overdue');
        if (res.ok) {
          const data = await res.json();
          setCount(data.count ?? data.length ?? 0);
        }
      } catch {
        setCount(0);
      }
    }
    fetchOverdue();
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
      {count > 99 ? '99+' : count}
    </span>
  );
}
