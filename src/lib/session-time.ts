export function sessionEndTimestamp(s: { sessionDate?: string | null; endTime?: string | null; startTime?: string | null }): number | null {
  // A session counts as "ended" only once its grid has a sane range:
  // endTime strictly after startTime. Inverted or missing times (e.g.
  // "21:00–19:30") are invalid and never auto-mark absent or consume a
  // credit, so a student is never penalized for a session whose real end
  // is still in the future.
  if (!s?.startTime || !s?.endTime) return null;
  const m0 = s.startTime.match(/^(\d{1,2}):(\d{2})/);
  const m1 = s.endTime.match(/^(\d{1,2}):(\d{2})/);
  const datePart = String(s?.sessionDate || "").slice(0, 10);
  const d = datePart.split("-").map(Number);
  if (!m0 || !m1 || d.length !== 3 || !d[0]) return null;
  const start = new Date(d[0], d[1] - 1, d[2], Number(m0[1]), Number(m0[2])).getTime();
  const end = new Date(d[0], d[1] - 1, d[2], Number(m1[1]), Number(m1[2])).getTime();
  if (end <= start) return null;
  return end;
}