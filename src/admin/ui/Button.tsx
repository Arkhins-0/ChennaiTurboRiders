import { cn } from "@/lib/utils";

/**
 * The console's button, as a workspace's: compact (32px at `sm`, 13px type),
 * 8px corners, never a pill.
 *
 * `default` is the accent and the one main action on a screen — the one that
 * writes. Everything beside it is `outline` (white with a hairline and a
 * whisper of shadow), `secondary` (a grey fill), `ghost` (no frame, for icon
 * buttons and quiet rows) or `destructive` (red words on a red tint). Every
 * variant carries a 1px border, transparent where it is not drawn, so a row of
 * mixed buttons lines up.
 */

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap border border-transparent font-medium outline-none transition-colors " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/25 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const VARIANTS = {
  default: "bg-primary text-primary-fg shadow-sm hover:bg-primary-deep",
  outline: "border-border bg-card text-foreground shadow-sm hover:bg-high",
  secondary: "bg-secondary text-secondary-fg hover:bg-foreground/[0.07]",
  ghost: "text-muted-fg hover:bg-foreground/[0.05] hover:text-foreground",
  destructive: "border-destructive/30 bg-destructive/[0.06] text-destructive hover:bg-destructive/[0.12]",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

const SIZES = {
  xs: "h-7 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
  sm: "h-8 rounded-lg px-3 text-[13px] [&_svg:not([class*='size-'])]:size-4",
  md: "h-9 rounded-lg px-3.5 text-sm",
  lg: "h-10 rounded-lg px-4 text-sm",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-4",
  "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/** The classes on their own, for a Next `<Link>` that should read as a button. */
export function buttonClass(
  variant: ButtonVariant = "default",
  size: ButtonSize = "sm",
  className?: string
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** The same thing as an anchor, for links that should read as buttons. */
export function ButtonLink({
  variant = "outline",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}
