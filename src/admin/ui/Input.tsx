import { cn } from "@/lib/utils";

/**
 * Form controls.
 *
 * All three share one border, one radius and one focus treatment — the border
 * turns the accent and a soft accent ring appears — so a row mixing an input,
 * a select and a button is flush. Filled with the card colour and a whisper of
 * shadow, as a workspace's fields are.
 */

const FIELD =
  "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-shadow " +
  "placeholder:text-faint " +
  "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/20 " +
  "disabled:pointer-events-none disabled:opacity-60";

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
  return <span className={cn("block text-[13px] font-medium text-muted-fg", className)} {...props} />;
}
