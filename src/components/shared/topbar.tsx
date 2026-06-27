"use client";

import { useT } from "@/lib/i18n";
import { memo } from "react";
import { logout } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/shared/notification-bell";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { LogOut, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/utils";
import { useRef } from "react";

function openSearch() {
  window.dispatchEvent(new CustomEvent("open-search"));
}

export const Topbar = memo(function Topbar({ userName, tenantName }: { userName: string; tenantName: string }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    openSearch();
    inputRef.current?.blur();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <div className="md:hidden text-base font-bold tracking-tight">ProfManager</div>
      <div className="hidden text-sm text-muted-foreground md:block">{tenantName}</div>
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            ref={inputRef}
            onFocus={handleFocus}
            placeholder={`${t("common.search")}...`}
            className="h-9 w-56 pl-8 pr-12 text-sm bg-muted/50 focus:bg-background"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground/60">
            &#8984;K
          </kbd>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={openSearch}
          title={t("common.search")}
        >
          <Search className="size-4" />
        </Button>
        <LanguageSwitcher />
        <NotificationBell />
        <div className="flex items-center gap-2 pl-2 border-l">
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px]">{initials(userName)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">{userName}</span>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" title={t("nav.logout")} className="text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
});
