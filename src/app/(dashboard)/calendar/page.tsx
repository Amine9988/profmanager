import { getCalendarEvents } from "@/server/actions/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, BookOpen, CreditCard, AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const typeColors: Record<string, "default" | "secondary" | "destructive" | "warning" | "success"> = {
  session: "default",
  subscription_expiry: "destructive",
  payment_due: "warning",
  absence: "secondary",
};

const typeIcons: Record<string, typeof BookOpen> = {
  session: BookOpen,
  subscription_expiry: CreditCard,
  payment_due: AlertTriangle,
  absence: X,
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = parseInt(params.month ?? String(now.getMonth() + 1));
  const year = parseInt(params.year ?? String(now.getFullYear()));
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const events = await getCalendarEvents(month, year);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const eventsByDay = new Map<number, typeof events>();
  for (const e of events) {
    const day = new Date(e.date).getDate();
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(e);
  }

  const monthKeys = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="size-6" />
          {t("calendar.title")}
        </h1>
        <div className="flex items-center gap-2">
          <a href={`/calendar?month=${prevMonth}&year=${prevYear}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            â†
          </a>
          <span className="min-w-32 text-center font-medium">
            {t(`months.${monthKeys[month - 1]}`)} {year}
          </span>
          <a href={`/calendar?month=${nextMonth}&year=${nextYear}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            â†’
          </a>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-lg border bg-muted overflow-hidden">
        {dayKeys.map((d) => (
          <div key={d} className="bg-card p-2 text-center text-xs font-medium text-muted-foreground">
            {t(`days.abbr_${d}`)}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-card p-2 min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayEvents = eventsByDay.get(day) ?? [];
          const isToday = isCurrentMonth && today.getDate() === day;
          return (
            <div
              key={day}
              className={`bg-card p-1.5 min-h-24 ${
                isToday ? "ring-2 ring-primary ring-inset" : ""
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const Icon = typeIcons[e.type];
                  return (
                    <Link
                      key={e.id}
                      href={e.href}
                      className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] hover:bg-accent"
                      title={e.roomName ? `${e.title} · ${e.roomName}` : e.title}
                    >
                      <Icon className="size-3 shrink-0" />
                      <span className="truncate">{e.title}</span>
                    </Link>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3}...</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* LÃ©gende */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><BookOpen className="size-4" /> {t("calendar.sessions")}</span>
        <span className="flex items-center gap-1"><CreditCard className="size-4 text-destructive" /> {t("calendar.expiry")}</span>
        <span className="flex items-center gap-1"><AlertTriangle className="size-4 text-warning" /> {t("calendar.payments_due")}</span>
      </div>

      {/* Liste des Ã©vÃ©nements du mois */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("calendar.all_events")}</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("calendar.no_events")}</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => {
                const BadgeIcon = typeIcons[e.type];
                return (
                  <Link
                    key={e.id}
                    href={e.href}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent"
                  >
                    <BadgeIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(e.date, "ar-DZ")}
                        {e.groupName ? ` · ${e.groupName}` : ""}
                        {e.roomName ? ` · ${e.roomName}` : ""}
                      </p>
                    </div>
                    <Badge variant={typeColors[e.type]}>{t(`calendar.type_${e.type}`)}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
