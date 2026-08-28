import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { BottomNav } from "@/components/shared/bottom-nav";
import { PageShell } from "@/components/shared/page-shell";
import { LocaleProvider } from "@/lib/i18n-context";
import { DataCacheProvider } from "@/lib/data-cache";
import { getTenantContext } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n";
import { AlertTriangle } from "lucide-react";
import { DialogCleanup } from "@/components/shared/dialog-cleanup";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("@/components/shared/command-palette").then((m) => ({ default: m.CommandPalette })),
  { loading: () => null }
);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  const [{ data: user }, { data: tenant }] = await Promise.all([
    ctx.supabase.from("users").select("fullName").eq("id", ctx.userId).single(),
    ctx.supabase.from("tenants").select("name").eq("id", ctx.tenantId).single(),
  ]);
  const locale = await getLocale();
  const t = await getT(locale);

  return (
    <LocaleProvider locale={locale}>
      <DataCacheProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={user?.fullName || ""} tenantName={tenant?.name ?? ""} showLogout={process.env.AUTH_MODE === "accounts"} />
          {ctx.frozen && (
            <div className="flex items-center gap-2 border-b border-amber-300/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>{t("auth.trial_expired")}</span>
            </div>
          )}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <PageShell>{children}</PageShell>
          </main>
          <BottomNav />
        </div>
        <CommandPalette />
        <DialogCleanup />
      </div>
      </DataCacheProvider>
    </LocaleProvider>
  );
}
