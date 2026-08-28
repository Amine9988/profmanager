"use client";

import { useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useT, useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronRight, CalendarCheck, Users, Printer, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { toast } from "sonner";

interface SessionSummary {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status?: string;
  group?: {
    id: string;
    name: string;
    subject?: { name?: string } | null;
    roomId?: string | null;
  } | null;
}

interface GroupInfo {
  id: string;
  name: string;
  subject?: { id?: string; name?: string } | null;
  teacher?: { id?: string; firstName?: string; lastName?: string } | null;
  studentCount: number;
}

function teacherName(teacher: GroupInfo["teacher"]): string {
  if (!teacher) return "";
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ");
}

export function AttendanceBrowser({
  sessions,
  groups,
  roomById,
}: {
  sessions: SessionSummary[];
  groups: GroupInfo[];
  roomById: Record<string, string>;
}) {
  const t = useT();
  const { direction } = useI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const pdfViewerUrlRef = useRef<string | null>(null);

  function statusLabel(status: string | null | undefined): string {
    if (!status || status === "unmarked") return t("attendance.unmarked");
    if (status === "present") return t("attendance.present");
    if (status === "absent") return t("attendance.absent");
    if (status === "late") return t("attendance.late");
    if (status === "excused") return t("attendance.excused");
    return status;
  }

  function buildAttendanceHtml(
    session: SessionSummary,
    roster: { student: { fullName: string }; attendance: { status: string | null } | null }[],
    roomName: string | null
  ): string {
    const dateLabel = formatDate(new Date(session.sessionDate + "T00:00:00"));
    const timeLabel = `${session.startTime} – ${session.endTime}`;
    const title = session.group?.name || "";
    const presentCount = roster.filter((r) => r.attendance?.status === "present" || r.attendance?.status === "late").length;
    const absentCount = roster.filter((r) => r.attendance?.status === "absent").length;
    const rows = roster.map((r, idx) => {
      const st = r.attendance?.status ?? "unmarked";
      const label = statusLabel(st);
      const bg = st === "present" || st === "late" ? "#dcfce7" : st === "absent" ? "#fee2e2" : st === "excused" ? "#fef9c3" : "#f1f5f9";
      const color = st === "present" || st === "late" ? "#16a34a" : st === "absent" ? "#dc2626" : st === "excused" ? "#ca8a04" : "#64748b";
      return `<tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafc"};"><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${idx + 1}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">${r.student.fullName}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;background:${bg};color:${color};font-weight:600;">${label}</span></td></tr>`;
    }).join("");
    return `
      <div id="att-print" dir="rtl" style="width:540px;margin:0 auto;padding:24px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;direction:rtl;text-align:right;">
        <h2 style="text-align:center;font-size:18px;font-weight:700;margin:0 0 4px;color:#1e293b;">كشف الحضور</h2>
        <p style="text-align:center;font-size:13px;color:#475569;margin:0 0 12px;">${title}${roomName ? " — " + roomName : ""}</p>
        <p style="text-align:center;font-size:12px;color:#64748b;margin:0 0 16px;">${dateLabel} · ${timeLabel}</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;font-size:12px;">
          <span style="background:#dcfce7;color:#16a34a;padding:4px 10px;border-radius:9999px;font-weight:600;">${t("attendance.present")}: ${presentCount}</span>
          <span style="background:#fee2e2;color:#dc2626;padding:4px 10px;border-radius:9999px;font-weight:600;">${t("attendance.absent")}: ${absentCount}</span>
          <span style="background:#f1f5f9;color:#475569;padding:4px 10px;border-radius:9999px;font-weight:600;">${t("common.total")}: ${roster.length}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;"><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;width:40px;">#</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${t("students.form.fullName")}</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:center;width:120px;">${t("common.status")}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;">${t("attendance.noStudents")}</td></tr>`}</tbody>
        </table>
        <p style="text-align:center;font-size:11px;color:#94a3b8;margin:16px 0 0;">${new Date().toLocaleString("ar-DZ", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false })}</p>
      </div>
    `;
  }

  async function handlePrint(session: SessionSummary) {
    const id = session.id;
    setPrintingId(id);
    try {
      const res = await fetch(`/api/attendance/session/${id}`);
      if (!res.ok) { toast.error(t("common.error")); return; }
      const data = await res.json();
      const roster: { student: { fullName: string }; attendance: { status: string | null } | null }[] = data.roster || [];
      const roomName = data.session?.group?.roomId ? roomById[data.session.group.roomId] ?? null : null;
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;";
      container.innerHTML = buildAttendanceHtml(session, roster, roomName);
      document.body.appendChild(container);
      await new Promise((r) => setTimeout(r, 300));
      const el = document.getElementById("att-print");
      if (!el) { toast.error(t("common.error")); return; }
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgData = canvas.toDataURL("image/png");
      const ratio = pdf.internal.pageSize.getWidth() / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdf.internal.pageSize.getWidth(), canvas.height * ratio);
      if (pdfViewerUrlRef.current) URL.revokeObjectURL(pdfViewerUrlRef.current);
      const url = URL.createObjectURL(pdf.output("blob"));
      pdfViewerUrlRef.current = url;
      setPdfViewerUrl(url);
    } catch (e) {
      console.error("attendance print error", e);
      toast.error(t("common.error"));
    } finally {
      document.getElementById("att-print")?.parentElement?.remove();
      setPrintingId(null);
    }
  }

  const sessionCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const gid = s.group?.id;
      if (!gid) continue;
      map.set(gid, (map.get(gid) || 0) + 1);
    }
    return map;
  }, [sessions]);

  const selectedSessions = useMemo(
    () => (selectedGroupId ? sessions.filter((s) => s.group?.id === selectedGroupId) : []),
    [sessions, selectedGroupId]
  );

  const groupedByDate = useMemo(() => {
    const result: { date: string; sessions: SessionSummary[] }[] = [];
    for (const s of selectedSessions) {
      const dateStr = s.sessionDate.slice(0, 10);
      let group = result.find((g) => g.date === dateStr);
      if (!group) {
        group = { date: dateStr, sessions: [] };
        result.push(group);
      }
      group.sessions.push(s);
    }
    return result;
  }, [selectedSessions]);

  return (
    <div className="space-y-6" dir={direction}>
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t("attendance.selectGroup")}
        </h2>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("groups.noGroups")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => {
              const count = sessionCountByGroup.get(g.id) || 0;
              const selected = selectedGroupId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(selected ? null : g.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "bg-card text-foreground hover:border-primary/50 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {g.subject?.name && (
                          <Badge variant={selected ? "outline" : "secondary"} className={selected ? "border-primary-foreground/30 text-primary-foreground" : ""}>
                            {g.subject.name}
                          </Badge>
                        )}
                        {teacherName(g.teacher) && (
                          <span className={selected ? "text-primary-foreground/80" : "text-muted-foreground"}>
                            {teacherName(g.teacher)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-1 ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      <Users className="size-3.5" />
                      {g.studentCount}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        count > 0
                          ? selected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary"
                          : selected
                            ? "bg-primary-foreground/10 text-primary-foreground/70"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count > 0 ? `${count} ${t("groups.upcomingSessions")}` : t("attendance.noUpcoming")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!selectedGroupId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarCheck className="size-8 opacity-40" />
            <p className="text-sm">{t("attendance.selectGroupHint")}</p>
          </CardContent>
        </Card>
      ) : groupedByDate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarCheck className="size-8 opacity-40" />
            <p className="text-sm">{t("attendance.noUpcoming")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedByDate.map(({ date, sessions: daySessions }) => (
            <section key={date}>
              <h2 className="mb-3 text-lg font-semibold">{formatDate(new Date(date + "T00:00:00"))}</h2>
              <div className="space-y-3">
                {daySessions.map((s) => (
                  <div key={s.id} className="flex gap-2">
                    <Link href={`/attendance/session/${s.id}`} className="flex-1">
                      <Card className="transition-shadow hover:shadow-md h-full">
                        <CardContent className="flex items-center justify-between py-4">
                          <div>
                            <p className="font-semibold">{s.group?.name ?? "?"}</p>
                            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                              {s.group?.subject?.name && <Badge variant="secondary">{s.group.subject.name}</Badge>}
                              {s.group?.roomId && roomById[s.group.roomId] && <Badge variant="outline">{roomById[s.group.roomId]}</Badge>}
                              <span>
                                {s.startTime} – {s.endTime}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="size-5 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 self-center"
                      onClick={() => handlePrint(s)}
                      disabled={printingId === s.id}
                      title={t("common.print")}
                    >
                      <Printer className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!pdfViewerUrl} onOpenChange={(o) => { if (!o) { setPdfViewerUrl(null); if (pdfViewerUrlRef.current) { URL.revokeObjectURL(pdfViewerUrlRef.current); pdfViewerUrlRef.current = null; } } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("attendance.title")}</DialogTitle>
          </DialogHeader>
          {pdfViewerUrl && (
            <iframe src={pdfViewerUrl} className="w-full flex-1 min-h-0 border-0 rounded" style={{ height: "calc(90vh - 120px)" }} />
          )}
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => { const a = document.createElement("a"); a.href = pdfViewerUrl!; a.download = "حضور-" + new Date().toISOString().slice(0, 10) + ".pdf"; a.click(); }}>
              <FileText className="size-4 ml-1" /> {t("common.download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
