"use client";

import { useT } from "@/lib/i18n";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { LogOut } from "@/lib/lucide";
import { initials } from "@/lib/utils";
import { logout } from "@/server/actions/auth";

export const Topbar = memo(function Topbar({ userName, tenantName, showLogout = false }: { userName: string; tenantName: string; showLogout?: boolean }) {
  const t = useT();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <div className="md:hidden text-base font-bold tracking-tight">ProfManager</div>
      <div className="hidden text-sm text-muted-foreground md:block">{tenantName}</div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        {showLogout && (
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" title={t("auth.logout")}>
              <LogOut className="size-4" />
            </Button>
          </form>
        )}
        <div className="flex items-center gap-2 pl-2 border-l">
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px]">{initials(userName)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">{userName}</span>
        </div>
      </div>
    </header>
  );
});