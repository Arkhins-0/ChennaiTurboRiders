"use client";

import { cn } from "@/lib/utils";

/**
 * A small status chip: Unsaved, Hidden, a template name, a count.
 *
 * Fully round and 20px tall, so it never competes with the square-cornered
 * controls around it — a badge is a label, not something to press.
 */

const VARIANTS = {
  default: "bg-primary text-primary-fg",
  secondary: "bg-secondary text-secondary-fg",
  outline: "border-border text-muted-fg",
  destructive: "bg-destructive/10 text-destructive",
} as const;

export function Badge({
  variant = "secondary",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: keyof typeof VARIANTS }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2 text-[11px] font-medium",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
