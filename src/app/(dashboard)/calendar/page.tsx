import { getCalendarEvents } from "@/server/actions/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, BookOpen } from "@/components/ui/icons";
import Link from "next/link";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const m = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

// Day-of-month of an event's date, computed from the date parts in the local
// timezone. Parsing "2026-08-13" via `new Date()` uses UTC midnight, which
// would shift the event to the previous day on negative-offset timezones.
function eventDay(dateStr: string): number {
  const p = parseDateParts(dateStr);
  return p ? p.day : new Date(dateStr).getDate();
}

function formatEventDate(dateStr: string, locale: string): string {
  const p = parseDateParts(dateStr);
  if (!p) return dateStr;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(p.year, p.month - 1, p.day));
}

const typeIcons: Record<string, typeof BookOpen> = {
  session: BookOpen,
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  // Always anchor to the CURRENT month unless valid explicit params arrive.
  // Invalid/garbage params (or stale cached ones) fall back to today.
  const now = new Date();
  const qMonth = parseInt(String(params.month ?? ""), 10);
  const qYear = parseInt(String(params.year ?? ""), 10);
  const month = Number.isFinite(qMonth) && qMonth >= 1 && qMonth <= 12 ? qMonth : now.getMonth() + 1;
  const year = Number.isFinite(qYear) && qYear >= 2000 && qYear <= 2100 ? qYear : now.getFullYear();
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
    const day = eventDay(String(e.date));
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
          <a href={`/calendar?month=${prevMonth}&year=${prevYear}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" aria-label={t("calendar.prev_month")}>
            {locale === "ar" ? "→" : "←"}
          </a>
          <span className="min-w-32 text-center font-medium">
            {t(`months.${monthKeys[month - 1]}`)} {year}
          </span>
          <a href={`/calendar?month=${nextMonth}&year=${nextYear}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" aria-label={t("calendar.next_month")}>
            {locale === "ar" ? "←" : "→"}
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
                  const color = e.groupColor || undefined;
                  return (
                    <Link
                      key={e.id}
                      href={e.href}
                      className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] hover:bg-accent"
                      style={
                        e.type === "session" && color
                          ? { backgroundColor: `${color}1f`, borderInlineStart: `3px solid ${color}` }
                          : undefined
                      }
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

      {/* LÃ©gende — groupes uniquement */}
      {(() => {
        const groupColors = new Map<string, string>();
        for (const e of events) {
          if (e.groupName && e.groupColor) {
            if (!groupColors.has(e.groupName)) groupColors.set(e.groupName, e.groupColor);
          }
        }
        return (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground"><BookOpen className="size-4" /> {t("calendar.sessions")}</span>
            {Array.from(groupColors.entries()).map(([name, color]) => (
              <span key={name} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-full border" style={{ backgroundColor: `${color}55`, borderColor: color }} />
                {name}
              </span>
            ))}
          </div>
        );
      })()}

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
                const color = e.groupColor || undefined;
                return (
                  <Link
                    key={e.id}
                    href={e.href}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent"
                    style={color ? { borderInlineStart: `4px solid ${color}` } : undefined}
                  >
                    {color ? (
                      <span className="inline-block size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    ) : (
                      <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatEventDate(String(e.date), locale)}
                        {e.groupName ? ` · ${e.groupName}` : ""}
                        {e.roomName ? ` · ${e.roomName}` : ""}
                      </p>
                    </div>
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
