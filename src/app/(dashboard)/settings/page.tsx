import { getTenantSettings } from "@/server/actions/settings";
import { TenantSettingsForm } from "@/components/shared/tenant-settings-form";
import { SchoolYearForm } from "@/components/shared/school-year-form";
import { ExcelExportCard } from "@/components/shared/excel-export-card";
import { UpdateCard } from "@/components/shared/update-card";
import { ChangePasswordCard } from "@/components/shared/change-password-card";

import { ResetButton } from "@/components/shared/reset-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const [tenant] = await Promise.all([
    getTenantSettings(),
  ]);

  if (!tenant) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general")}</CardTitle>
        </CardHeader>
        <CardContent>
            <TenantSettingsForm
            tenant={{
              name: tenant.name,
              schoolPhone: tenant.schoolPhone,
              schoolLogo: tenant.schoolLogo,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">السنة الدراسية</CardTitle>
        </CardHeader>
        <CardContent>
          <SchoolYearForm
            initialSettings={{
              schoolYearStart: tenant.schoolYearStart,
              schoolYearEnd: tenant.schoolYearEnd,
            }}
          />
        </CardContent>
      </Card>

      <ExcelExportCard />

      <UpdateCard />

      <ChangePasswordCard />

      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="text-base text-red-600">{t("settings.danger_zone")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResetButton />
        </CardContent>
      </Card>
    </div>
  );
}
