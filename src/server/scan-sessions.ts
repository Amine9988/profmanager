const MAX_ITEMS = 50;
const TTL_MS = 10 * 60 * 1000;
const DEDUP_MS = 2000;

interface Entry {
  studentId: string;
  fullName: string;
  ts: number;
}

const g = globalThis as any;
if (!g.__scanRelay) {
  g.__scanRelay = { queue: [] as Entry[], last: new Map<string, number>() };
}
const store = g.__scanRelay as { queue: Entry[]; last: Map<string, number> };

function prune() {
  const now = Date.now();
  while (store.queue.length > 0 && now - store.queue[0].ts > TTL_MS) store.queue.shift();
}

export function submitScan(studentId: string, fullName?: string): void {
  prune();
  const now = Date.now();
  const last = store.last.get(studentId) || 0;
  if (now - last < DEDUP_MS) return;
  store.last.set(studentId, now);
  store.queue.push({ studentId, fullName: fullName || "", ts: now });
  if (store.queue.length > MAX_ITEMS) store.queue.splice(0, store.queue.length - MAX_ITEMS);
}

export function pollScan(): { studentId: string; fullName: string } | null {
  prune();
  const e = store.queue.shift();
  return e ? { studentId: e.studentId, fullName: e.fullName } : null;
}

export function clearScanQueue(): void {
  store.queue.length = 0;
  store.last.clear();
}
