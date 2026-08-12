import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionWithAttendance } from "@/server/actions/attendance";
import { getRooms } from "@/server/actions/groups";
import { AttendanceMarker } from "@/components/attendance/attendance-marker";
import { CancelSessionButton } from "@/components/attendance/cancel-session-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getT, getInitialLocale, getDirection, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SessionAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const direction = getDirection(locale as Locale);
  const [data, rooms] = await Promise.all([getSessionWithAttendance(id), getRooms()]);

  if (!data) { notFound(); return null; }

  const { session, roster } = data;
  const roomName = (session as any).group?.roomId
    ? rooms.find((r: any) => r.id === (session as any).group.roomId)?.name
    : undefined;
  const isCancelled = (session as any).status === "cancelled";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6" dir={direction}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/attendance">
              {direction === "rtl" ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{session.group?.name ?? "?"}</h1>
              {roomName && <Badge variant="outline">{roomName}</Badge>}
              {(session as any).type === "extra" && <Badge variant="secondary">{t("attendance.extra_session")}</Badge>}
              {(session as any).type === "makeup" && <Badge variant="secondary">{t("attendance.makeup_session")}</Badge>}
              {isCancelled && <Badge variant="destructive">{t("attendance.cancelled")}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(session.sessionDate)} · {session.startTime} – {session.endTime}
            </p>
          </div>
        </div>
        {!isCancelled && <CancelSessionButton sessionId={session.id} />}
      </div>

      {isCancelled ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">{t("attendance.session_cancelled_msg")}</p>
        </div>
      ) : (
        <AttendanceMarker sessionId={session.id} roster={roster} />
      )}
    </div>
  );
}
