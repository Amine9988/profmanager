"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, useI18n } from "@/lib/i18n";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { NavOverdueBadge } from "@/components/shared/nav-overdue-badge";

import {
  LayoutDashboard,
  Users,
  ScanBarcode,
  CalendarCheck,
  Wallet,
  Banknote,
  AlertTriangle,
  CalendarDays,
  GraduationCap,
  UsersRound,
  Settings,
  Layers,
  DoorOpen,
  BookOpen,
  ScrollText,
  Trash2,
} from "@/lib/lucide";

const NAV_ITEMS = [
  { href: "/overview", key: "overview", icon: LayoutDashboard },
  { href: "/students", key: "students", icon: Users },
  { href: "/scanner", key: "scanner", icon: ScanBarcode },
  { href: "/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/payments", key: "payments", icon: Wallet, badge: true },
  { href: "/caisse", key: "caisse", icon: Banknote },
  { href: "/overdue", key: "overdue", icon: AlertTriangle },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/levels", key: "levels", icon: Layers },
  { href: "/rooms", key: "rooms", icon: DoorOpen },
  { href: "/subjects", key: "subjects", icon: BookOpen },
  { href: "/teachers", key: "teachers", icon: GraduationCap },
  { href: "/groups", key: "groups", icon: UsersRound },
  { href: "/certificates", key: "certificates", icon: ScrollText },
  { href: "/trash", key: "trash", icon: Trash2 },
  { href: "/settings", key: "settings", icon: Settings },
];

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useI18n();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-blue-950 bg-blue-900 text-white md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-white/10 px-6">
        <Link href="/overview" className="text-lg font-bold tracking-tight">
          ProfManager
        </Link>
        <span className="ml-2 text-[10px] uppercase text-white/60 font-mono">[{locale}]</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 group",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className={cn("size-4 shrink-0 transition-all duration-200", active ? "text-white" : "text-white/85")} />
              <span className="truncate">{t(`nav.${item.key}`)}</span>
              {item.badge && <NavOverdueBadge />}
            </Link>
          );
        })}

      </nav>
    </aside>
  );
});
