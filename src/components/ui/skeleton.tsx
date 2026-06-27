import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-gradient-to-r from-accent via-accent/80 to-accent animate-shimmer bg-[length:200%_100%] rounded-lg", className)}
      {...props}
    />
  );
}

export { Skeleton };
