import { getT, getInitialLocale } from "@/lib/i18n";
import { UpdateCard } from "@/components/shared/update-card";
import { OverviewModules } from "./overview-modules";

export const dynamic = "force-dynamic";

const MODULE_KEYS = [
  "students",
  "attendance",
  "payments",
  "caisse",
  "overdue",
  "calendar",
  "levels",
  "rooms",
  "subjects",
  "teachers",
  "groups",
  "certificates",
  "trash",
  "settings",
] as const;

const DESC_KEYS = [
  "students_desc",
  "attendance_desc",
  "payments_desc",
  "caisse_desc",
  "overdue_desc",
  "calendar_desc",
  "levels_desc",
  "rooms_desc",
  "subjects_desc",
  "teachers_desc",
  "groups_desc",
  "certificates_desc",
  "trash_desc",
  "settings_desc",
] as const;

export default async function OverviewPage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);

  const titles = Object.fromEntries(MODULE_KEYS.map((k) => [k, t(`nav.${k}`)]));
  const descriptions = Object.fromEntries(DESC_KEYS.map((k) => [k, t(`dashboard.modules.${k}`)]));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8 animate-fade-in">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.modules_subtitle")}</p>
      </header>

      <OverviewModules titles={titles} descriptions={descriptions} />

      <UpdateCard />
    </div>
  );
}
