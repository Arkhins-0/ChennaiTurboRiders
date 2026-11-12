import { cn } from "@/lib/utils";

/*
 * Loading placeholders: grey blocks the shape of the page that's coming, so a
 * slow page shows its outline at once instead of nothing. The shimmer is the
 * `.skeleton` rule in src/styles/globals.css, still for those who ask for less
 * motion. Used by the console's loading.tsx files.
 */

/** One grey block; size it with classes. `round` for a photo. */
export function Skeleton({
  className,
  round = false,
  style,
}: {
  className?: string;
  round?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn("skeleton block shrink-0", round ? "rounded-full" : "rounded-lg", className)}
      style={style}
    />
  );
}

/** The whole placeholder: said once as "Loading" to a screen reader, the blocks themselves hidden. */
export function SkeletonPage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={className}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** A figure tile: the icon square, the number, the line under it. */
export function SkeletonFigure() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <Skeleton className="size-8" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-1.5 h-3.5 w-28" />
    </div>
  );
}

/** A panel of rows: its header, then a line per row. */
export function SkeletonPanel({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-card", className)}>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={index % 2 ? "h-3.5 w-2/3" : "h-3.5 w-1/2"} />
              <Skeleton className="h-3 w-1/3" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
