"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, CalendarCheck, Wallet, Banknote, AlertTriangle, GraduationCap, Settings } from "lucide-react";

const navItems = [
  { href: "/overview", key: "overview", icon: LayoutDashboard },
  { href: "/students", key: "students", icon: Users },
  { href: "/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/payments", key: "payments", icon: Wallet },
  { href: "/caisse", key: "caisse", icon: Banknote },
  { href: "/overdue", key: "overdue", icon: AlertTriangle },
  { href: "/teachers", key: "teachers", icon: GraduationCap },
  { href: "/settings", key: "settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/90 backdrop-blur-lg md:hidden safe-area-bottom">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors duration-200",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className={cn("size-5 mb-0.5", active && "text-primary")} />
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
