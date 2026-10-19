import { cn } from "@/lib/utils";

/** A placeholder with a light sweeping across it while the real thing loads. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.07] before:to-transparent motion-reduce:before:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
