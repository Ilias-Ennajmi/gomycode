import { Skeleton } from "@/components/ui/skeleton";

/** The shape of a list row while it loads: picture on the left, as the real row. */
export function ArticleSkeleton() {
  return (
    <div className="flex gap-4 border-b px-4 py-[18px] md:px-5">
      <Skeleton className="mt-0.5 h-[76px] w-[76px] shrink-0 rounded-xl md:h-20 md:w-20" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function ArticleSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <ArticleSkeleton key={i} />
      ))}
    </div>
  );
}
