/** Coalesce expensive background maintenance so hot read paths don't re-run it. */

type JobFn = () => Promise<unknown>;

const lastRun = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();

export function runThrottled(key: string, minIntervalMs: number, fn: JobFn): void {
  const now = Date.now();
  const prev = lastRun.get(key) || 0;
  if (now - prev < minIntervalMs) return;
  if (inFlight.has(key)) return;
  const p = Promise.resolve()
    .then(fn)
    .then(() => {
      lastRun.set(key, Date.now());
    })
    .catch((e) => console.error(`[bg-job:${key}]`, e))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
}

export function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
