import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { BottomNav } from "@/components/shared/bottom-nav";
import { PageShell } from "@/components/shared/page-shell";
import { LocaleProvider } from "@/lib/i18n-context";
import { DataCacheProvider } from "@/lib/data-cache";
import { getTenantContext } from "@/lib/auth";
import { getLocale } from "@/lib/i18n";
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

  return (
    <LocaleProvider locale={locale}>
      <DataCacheProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={user?.fullName || ""} tenantName={tenant?.name ?? ""} />
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <PageShell>{children}</PageShell>
          </main>
          <BottomNav />
        </div>
        <CommandPalette />
      </div>
      </DataCacheProvider>
    </LocaleProvider>
  );
}
