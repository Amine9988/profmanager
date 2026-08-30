"use client";

import Link from "next/link";
import {
  Users,
  CalendarCheck,
  Wallet,
  Banknote,
  AlertTriangle,
  CalendarDays,
  Layers,
  DoorOpen,
  BookOpen,
  GraduationCap,
  UsersRound,
  ScrollText,
  Settings,
  Trash2,
  ChevronRight,
  type LucideIcon,
} from "@/lib/lucide";

const MODULES: { href: string; navKey: string; descKey: string; icon: LucideIcon }[] = [
  { href: "/students", navKey: "students", descKey: "students_desc", icon: Users },
  { href: "/attendance", navKey: "attendance", descKey: "attendance_desc", icon: CalendarCheck },
  { href: "/payments", navKey: "payments", descKey: "payments_desc", icon: Wallet },
  { href: "/caisse", navKey: "caisse", descKey: "caisse_desc", icon: Banknote },
  { href: "/overdue", navKey: "overdue", descKey: "overdue_desc", icon: AlertTriangle },
  { href: "/calendar", navKey: "calendar", descKey: "calendar_desc", icon: CalendarDays },
  { href: "/levels", navKey: "levels", descKey: "levels_desc", icon: Layers },
  { href: "/rooms", navKey: "rooms", descKey: "rooms_desc", icon: DoorOpen },
  { href: "/subjects", navKey: "subjects", descKey: "subjects_desc", icon: BookOpen },
  { href: "/teachers", navKey: "teachers", descKey: "teachers_desc", icon: GraduationCap },
  { href: "/groups", navKey: "groups", descKey: "groups_desc", icon: UsersRound },
  { href: "/certificates", navKey: "certificates", descKey: "certificates_desc", icon: ScrollText },
  { href: "/trash", navKey: "trash", descKey: "trash_desc", icon: Trash2 },
  { href: "/settings", navKey: "settings", descKey: "settings_desc", icon: Settings },
];

export function OverviewModules({
  titles,
  descriptions,
}: {
  titles: Record<string, string>;
  descriptions: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
      {MODULES.map(({ href, navKey, descKey, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group relative flex flex-col gap-5 rounded-xl border border-border bg-card p-5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_10px_36px_-14px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="pointer-events-none absolute end-5 top-5 rtl:-scale-x-100">
            <ChevronRight className="size-4 -translate-x-1 text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
          </span>
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary transition-colors duration-200 group-hover:bg-primary/[0.14]">
            <Icon className="size-11" strokeWidth={1.5} />
          </span>
          <span className="space-y-1 pe-5">
            <span className="block text-sm font-semibold tracking-tight">{titles[navKey]}</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">{descriptions[descKey]}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
