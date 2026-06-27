import { getTenantSettings, getTeamMembers } from "@/server/actions/settings";
import { getSubjects } from "@/server/actions/groups";
import { TenantSettingsForm } from "@/components/shared/tenant-settings-form";
import { SchoolYearForm } from "@/components/shared/school-year-form";
import { SubjectManager } from "@/components/shared/subject-manager";
import { SettingsLanguageCard } from "@/components/shared/settings-language-card";
import { BackupRestore } from "@/components/shared/backup-restore";
import { ResetButton } from "@/components/shared/reset-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const [tenant, subjects, members] = await Promise.all([
    getTenantSettings(),
    getSubjects(),
    getTeamMembers(),
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
              timezone: tenant.timezone,
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

      <SettingsLanguageCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.subjects")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SubjectManager subjects={subjects} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.team")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>{initials(m.user.fullName ?? m.user.email)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.user.fullName ?? m.user.email}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
              </div>
              <Badge variant="secondary" className="capitalize">
                {m.role.name}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <BackupRestore />

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
