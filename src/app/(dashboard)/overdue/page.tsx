import { getOverdueSubscriptions } from "@/server/actions/subscriptions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function OverduePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const fmt = (v: number) => formatCurrency(v);

  const overdueList = await getOverdueSubscriptions();

  const filterDays = filter === "30" ? 30 : filter === "7" ? 7 : null;
  const filtered = filterDays
    ? overdueList.filter((s) => s.daysOverdue <= filterDays)
    : overdueList;

  const longOverdue = filter === "30+" ? overdueList.filter((s) => s.daysOverdue > 30) : [];
  const displayData = filter === "30+" ? longOverdue : filtered;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("dashboard.overdue_title")}</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { href: "/overdue", label: t("common.all"), active: !filter },
          { href: "/overdue?filter=7", label: t("overdue.filter_7days"), active: filter === "7" },
          { href: "/overdue?filter=30", label: t("overdue.filter_30days"), active: filter === "30" },
          { href: "/overdue?filter=30%2B", label: t("overdue.filter_30plus"), active: filter === "30+" },
        ].map(({ href, label, active: isActive }) => (
          <a
            key={href}
            href={href}
            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent ${isActive ? "bg-accent" : ""}`}
          >
            {label}
          </a>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {displayData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("dashboard.no_overdue")}
            </p>
          ) : (
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="truncate">{t("common.student")}</TableHead>
                  <TableHead className="truncate">{t("common.phone")}</TableHead>
                  <TableHead className="truncate">{t("groups.title")}</TableHead>
                  <TableHead className="text-end whitespace-nowrap">{t("payments.amount_due")}</TableHead>
                  <TableHead className="text-end whitespace-nowrap">{t("payments.remaining")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("common.endDate")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("payments.days_overdue")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((sub) => (
                  <TableRow key={sub.id} className="bg-warning/5">
                    <TableCell className="truncate max-w-0">
                      <Link href={`/students/${sub.studentId}`} className="hover:underline font-medium">
                        {sub.studentName}
                      </Link>
                    </TableCell>
                    <TableCell className="truncate max-w-0">{sub.phone}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="flex flex-wrap gap-1">
                        {sub.groups.map((g) => (
                          <Badge key={g} variant="secondary" className="text-xs max-w-32 truncate">{g}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-end whitespace-nowrap font-medium">{fmt(sub.monthlyAmount)}</TableCell>
                    <TableCell className="text-end whitespace-nowrap font-medium text-destructive">{fmt(sub.remainingBalance)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(sub.endDate, locale)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="destructive">{sub.daysOverdue}{t("common.days_abbr")}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="destructive">{t("payments.overdue")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
