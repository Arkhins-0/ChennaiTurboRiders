"use client";

import { cn } from "@/lib/utils";

/**
 * Form controls.
 *
 * All three share one border, one radius and one focus treatment, so a row
 * mixing an input, a select and a button is flush. The fill is transparent
 * rather than a colour: on a card the field then reads as an outline on the
 * card's own surface, which is what keeps the UI flat.
 */

const FIELD =
  "w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition " +
  "placeholder:text-muted-fg/60 " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 " +
  "disabled:pointer-events-none disabled:opacity-50";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(FIELD, "h-9 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD, "resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(FIELD, "h-9 py-1", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("block text-[13px] font-medium text-foreground", className)} {...props} />;
}
