import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/admin/ui/icons";

/*
 * The dashboard's pieces, as a workspace's home: figure tiles, panels of rows,
 * a row. Server components — nothing here is interactive beyond a link.
 */

type IconType = ComponentType<{ className?: string }>;

/** One figure: a bordered tile with a small icon, the number (or a few words), and what it counts. */
export function Figure({
  icon: Icon,
  n,
  label,
  href,
  tone,
  words = false,
}: {
  icon: IconType;
  n: React.ReactNode;
  label: string;
  href?: string;
  tone?: "warn";
  /** `n` is words, not a number: a size that fits them in the tile. */
  words?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg",
          tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span
        className={cn(
          "mt-3 block font-semibold tabular-nums tracking-tight text-foreground",
          words ? "text-lg leading-snug" : "text-2xl"
        )}
      >
        {n}
      </span>
      <span className="mt-0.5 block text-[13px] text-faint">{label}</span>
    </>
  );
  const box = "block rounded-xl border border-border bg-card p-4 shadow-card";

  return href ? (
    <Link href={href} className={cn(box, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** A panel: a titled card of rows, with a count and a link in its header. */
export function Panel({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {count !== undefined ? (
          <span className="rounded-md bg-high px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-faint">
            {count}
          </span>
        ) : null}
        {action ? (
          <Link
            href={action.href}
            className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            {action.label}
            <ChevronRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/** A row in a panel: an icon, the text and a quieter line, something on the right. */
export function Line({
  href,
  icon: Icon,
  title,
  sub,
  end,
  tone,
}: {
  href: string;
  icon?: IconType;
  title: string;
  sub?: string;
  end?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-high">
      {Icon ? (
        <Icon className={cn("size-4 shrink-0", tone === "warn" ? "text-warn-fg" : "text-faint")} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
        {sub ? <span className="block truncate text-xs text-faint">{sub}</span> : null}
      </span>
      {end ? <span className="shrink-0 text-xs text-faint">{end}</span> : null}
    </Link>
  );
}

/** What an empty panel says. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[13px] text-faint">{children}</p>;
}
