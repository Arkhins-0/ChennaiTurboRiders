import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/admin/ui/Button";

/** The next step from an empty list: a page to open. */
export type EmptyAction = { label: string; href: string };

/**
 * What a list or a page shows when there is nothing in it yet: an icon in an
 * accent circle, a short title, one line on why or what comes here, and the
 * next step as a button when the viewer can take one. `section` is the smaller
 * one, for an empty part of a page rather than the whole page.
 */
export function EmptyState({
  icon: Icon,
  title,
  line,
  action,
  section = false,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  line?: string;
  action?: EmptyAction;
  section?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", section ? "px-4 py-6" : "px-6 py-12", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-full bg-primary/10 text-primary",
          section ? "size-10" : "size-14"
        )}
      >
        <Icon className={section ? "size-5" : "size-7"} />
      </span>
      <p className={cn("font-semibold text-foreground", section ? "mt-3 text-[13px]" : "mt-4 text-base")}>{title}</p>
      {line ? <p className="mt-1 max-w-sm text-[13px] text-muted-fg">{line}</p> : null}
      {action ? (
        <Link href={action.href} className={buttonClass(section ? "outline" : "default", "sm", section ? "mt-3" : "mt-5")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
