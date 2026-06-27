"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell } from "lucide-react";
import { getNotifications, markAllNotificationsRead, getUnreadNotificationCount } from "@/server/actions/notifications";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

type Notification = {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  isRead: boolean;
  createdAt: Date;
};

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    Promise.all([getUnreadNotificationCount(), getNotifications()]).then(
      ([count, list]) => {
        setUnread(count);
        setNotifications(list);
      }
    );
  }, []);

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    router.refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground" title={t('notifications.title')}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">{t('notifications.title')}</span>
          {unread > 0 && (
            <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline font-medium">
              {t('notifications.mark_all_read')}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Bell className="size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b px-4 py-3 last:border-0 transition-colors ${!n.isRead ? "bg-primary/5" : "hover:bg-muted/30"}`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/60">{formatDate(n.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
