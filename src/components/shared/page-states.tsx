"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SearchX } from "@/lib/lucide";
import { useT } from "@/lib/i18n";

export function PageSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6 animate-fade-in">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center animate-fade-in">
      <div className="rounded-full bg-destructive/10 p-4">
        <SearchX className="size-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{t("common.error_occurred")}</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">
          {error.message || t("common.page_load_error")}
        </p>
      </div>
      <Button onClick={reset} variant="outline">{t("common.retry")}</Button>
    </div>
  );
}
