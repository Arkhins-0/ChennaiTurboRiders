import { cn } from "@/lib/utils";

/**
 * A small status tag: Unsaved, Draft, a count.
 *
 * A rounded rectangle (6px), never a pill — a workspace's tag. `ok` and `warn`
 * are where something stands (Published, Needs a photo); `default` is the
 * accent, for the one thing on a row that wants noticing.
 */

const VARIANTS = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-high text-muted-fg",
  outline: "border-border text-muted-fg",
  destructive: "bg-destructive/10 text-destructive",
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({
  variant = "secondary",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-1.5 text-[11px] font-medium",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
