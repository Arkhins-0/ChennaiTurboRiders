import { ConsolePage } from "@/admin/components/PageStrip";
import { Skeleton, SkeletonFigure, SkeletonPage, SkeletonPanel } from "@/admin/ui/Skeleton";

/**
 * The dashboard's outline while its reads run: the greeting, four figures, the
 * next-round card and the two panels. Scoped to the dashboard by its route
 * group, so the editors never borrow this shape.
 */
export default function DashboardLoading() {
  return (
    <ConsolePage>
      <SkeletonPage className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-7 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
          <Skeleton className="size-14 rounded-xl" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3.5 w-1/3" />
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SkeletonPanel rows={4} />
          <SkeletonPanel rows={6} />
        </div>
      </SkeletonPage>
    </ConsolePage>
  );
}
