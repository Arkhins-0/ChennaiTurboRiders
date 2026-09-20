"use client";

import { cn } from "@/lib/utils";

/**
 * The admin's surface.
 *
 * One step lighter than the page it sits on, with a hairline border. That pair —
 * a lighter fill and a 10%-white edge — is the only way depth is expressed in
 * this UI; there are no shadows anywhere in the admin.
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
      className={cn("rounded-lg border border-border bg-card text-card-fg", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2.5 border-b border-border px-4 py-2.5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("font-medium tracking-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("truncate text-xs text-muted-fg", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
