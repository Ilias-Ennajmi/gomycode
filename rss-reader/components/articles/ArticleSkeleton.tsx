import { Skeleton } from "@/components/ui/skeleton";

export function ArticleSkeleton() {
  return (
    <div className="flex gap-3 border-b p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-[60px] w-[80px] shrink-0 rounded-lg" />
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
