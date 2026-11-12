import { cn } from "@/lib/utils";

/**
 * A page that is not an editor.
 *
 * The shell's main pane does not scroll on a laptop — the editors are
 * full-height and scroll inside their own panes — so a page that reads top to
 * bottom (the dashboard, the tools) scrolls itself, inside this. Below `md:`
 * the whole console scrolls as a document, and this is just padding.
 */
export function ConsolePage({
  children,
  className,
  width = "xl",
}: {
  children: React.ReactNode;
  className?: string;
  /** `xl` for a dashboard, `lg` for a tool, `md` for a form. */
  width?: "md" | "lg" | "xl";
}) {
  const max = width === "md" ? "max-w-3xl" : width === "lg" ? "max-w-5xl" : "max-w-screen-xl";
  return (
    <div data-console-page className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className={cn("mx-auto w-full", max, className)}>{children}</div>
    </div>
  );
}

/**
 * The top of a page, as a workspace's: a quiet line above when it helps (a
 * date, a kind), the title, a line under it saying what the page is for, and
 * the page's actions on the right (under the title on a phone).
 */
export function PageStrip({
  title,
  sub,
  eyebrow,
  children,
  className,
}: {
  title: React.ReactNode;
  /** What the page covers, in a sentence. */
  sub?: React.ReactNode;
  /** A short line above the title. */
  eyebrow?: React.ReactNode;
  /** The page's actions, right-aligned. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-end md:gap-6", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="mb-0.5 text-[13px] text-faint">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {sub ? <p className="mt-1 max-w-3xl text-[13px] text-faint">{sub}</p> : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">{children}</div>
      ) : null}
    </header>
  );
}

/** A section's title inside a page, with a count beside it in a small grey tag. */
export function SectionStrip({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      {count !== undefined ? (
        <span className="rounded-md bg-high px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-faint">
          {count}
        </span>
      ) : null}
      {children ? <span className="ml-auto flex items-center gap-2">{children}</span> : null}
    </div>
  );
}
