"use client";

import { cn } from "@/lib/utils";

/**
 * The admin's button.
 *
 * Six variants and one shape language: a 1px transparent border on every one, so
 * an outline button and a solid one are exactly the same size and a row of mixed
 * buttons lines up. The press is a scale, not a shadow — nothing in this UI
 * casts one.
 *
 * `default` is the only coloured button in the admin. Use it for the action that
 * writes; everything else is `outline`, `secondary` or `ghost`.
 */

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap border border-transparent font-medium outline-none transition " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const VARIANTS = {
  default: "bg-primary text-primary-fg hover:bg-primary/85",
  outline: "border-input text-foreground hover:bg-muted",
  secondary: "bg-secondary text-secondary-fg hover:bg-secondary/70",
  ghost: "text-muted-fg hover:bg-muted hover:text-foreground",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  link: "text-foreground underline-offset-4 hover:underline",
} as const;

const SIZES = {
  xs: "h-7 rounded px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-8 rounded-md px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
  md: "h-9 rounded-md px-3 text-sm",
  lg: "h-10 rounded-md px-4 text-sm",
  icon: "size-9 rounded-md",
  "icon-sm": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
  "icon-xs": "size-7 rounded [&_svg:not([class*='size-'])]:size-3",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}

/** The same thing as an anchor, for links that should read as buttons. */
export function ButtonLink({
  variant = "outline",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}
