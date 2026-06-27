"use client";

import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function DeadlinesPage() {
  const t = useT();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{t("nav.deadlines")}</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Clock className="size-12 mb-4 opacity-40" />
          <p>{t("common.coming_soon")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
