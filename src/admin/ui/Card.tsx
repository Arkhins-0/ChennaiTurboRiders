import { cn } from "@/lib/utils";

/**
 * The console's surface: a white panel with 12px corners, a hairline border and
 * a whisper of a shadow (`shadow-card`). In dark mode it is a step lighter than
 * the page instead.
 *
 * Compose the parts. A card with a header and content is the default shape:
 *
 *   <Card>
 *     <CardHeader><CardTitle>…</CardTitle><CardDescription>…</CardDescription></CardHeader>
 *     <CardContent>…</CardContent>
 *   </Card>
 */

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card text-card-fg shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2.5 border-b border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-[13px] font-semibold text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("truncate text-xs text-faint", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
