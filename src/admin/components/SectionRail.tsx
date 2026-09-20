"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/admin/components/AdminShell";
import { DragIcon, EyeIcon, EyeSlashIcon, PlusIcon } from "@/admin/ui/icons";

/**
 * Which part of a page is being edited — and, where the page has a running
 * order, what that order is.
 *
 * Lives at the top of the console sidebar, above the screen switcher — a plain
 * list of rows in the same shape as the links below it, so the whole left column
 * reads as one thing rather than two lists that happen to touch. Below `md:` the
 * same rows become a scrolling chip row, which is the sidebar's own behaviour at
 * that width.
 *
 * An entry that carries `visible` is a section of the page itself: it can be
 * dragged up and down to move the section on the page, and switched off to take
 * it off. Entries without it are fixed — the page's identity, and the header and
 * footer — and sit above the ones that move. That is the whole of the running
 * order; there is no separate layout screen, because the list you pick from and
 * the list the page is built from are the same list.
 *
 * Reordering is a drag handle plus arrow keys on it, and the keys are not a
 * nicety: HTML5 drag does not work on touch at all, which is also why the handle
 * is hidden below `md:` where the rail is a chip row nobody can drag anyway.
 *
 * ── The `+` ───────────────────────────────────────────────────────────────
 *
 * `onAdd` puts a button at the foot of the list. What it offers is the caller's
 * to decide — the page editor asks the registry, filtered by surface, by the
 * site's modules and by what is already placed — so the rail stays what it has
 * always been: a list of rows that knows nothing about what they mean.
 */

export type RailItem<Id extends string> = {
  id: Id;
  /** Fallback label, used where an entry has no `title`. */
  short: string;
  /** The label the rail shows. Long ones truncate. */
  title?: string;
  hint: string;
  /** Set on entries that are sections of the page. Those are the movable ones. */
  visible?: boolean;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
};

/** One entry in the picker behind the `+`. */
export type RailChoice = {
  type: string;
  label: string;
  hint: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
};

export function SectionRail<Id extends string>({
  items,
  active,
  onSelect,
  onReorder,
  onToggleVisible,
  choices,
  onAdd,
  heading = "Sections",
}: {
  items: readonly RailItem<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** Moves `fromId` to the place `toId` currently holds. */
  onReorder?: (fromId: Id, toId: Id) => void;
  onToggleVisible?: (id: Id) => void;
  /** What the `+` offers. Omitted, or empty, and there is no `+`. */
  choices?: readonly RailChoice[];
  onAdd?: (type: string) => void;
  /**
   * What the rail is listing. Defaults to the sections of a page, because that
   * is what every editor but one puts here — the circuits screen lists records
   * instead, and calling those "Sections" would be a lie in the one place a
   * label is meant to remove doubt.
   */
  heading?: string;
}) {
  /** Tracked by id, not index: the list reorders under the pointer mid-drag. */
  const [dragging, setDragging] = useState<Id | null>(null);
  const [picking, setPicking] = useState(false);

  /**
   * Collapsed, the rail is icons only: no labels, no handles, no eyes. What
   * survives is picking a section, which is the one thing the rail is for. The
   * order, the on/off switches and the `+` are still there a click away, in the
   * expanded sidebar.
   */
  const collapsed = useSidebarCollapsed();

  const movable = items.filter((item) => item.visible !== undefined);
  const sortable = movable.length > 0 && Boolean(onReorder);
  const canAdd = Boolean(onAdd) && (choices?.length ?? 0) > 0 && !collapsed;

  /** Arrow keys on the handle, which is the only reordering touch and keyboards get. */
  function nudge(id: Id, step: number) {
    const index = movable.findIndex((item) => item.id === id);
    const target = movable[index + step];
    if (target) onReorder?.(id, target.id);
  }

  return (
    <nav
      aria-label={heading}
      className="flex gap-1 overflow-x-auto md:flex-col md:overflow-x-visible"
    >
      {/* pr-7 keeps the label clear of the sidebar's collapse button, which
          floats at the top-right of this same line. */}
      {collapsed ? null : (
        <p className="hidden px-2 py-1 pr-7 text-[11px] font-medium text-muted-fg md:block">
          {heading}
        </p>
      )}

      {items.map((item) => {
        const selected = item.id === active;
        const moves = item.visible !== undefined;
        const off = item.visible === false;
        const { Icon } = item;

        return (
          <div
            key={item.id}
            draggable={dragging === item.id}
            onDragEnter={() => {
              if (dragging && moves && dragging !== item.id) onReorder?.(dragging, item.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragEnd={() => setDragging(null)}
            className={cn(
              "flex shrink-0 items-center gap-0.5 rounded-md pr-0.5 transition-colors",
              selected ? "bg-muted" : "hover:bg-muted/60",
              dragging === item.id && "opacity-40 ring-1 ring-primary/60"
            )}
          >
            {/* Reserved on every row when anything moves, so the labels line up
                whether or not the row has a handle of its own. */}
            {sortable && !collapsed ? (
              moves ? (
                <button
                  type="button"
                  aria-label={`Reorder ${item.title ?? item.short}. Use the arrow keys.`}
                  onPointerDown={() => setDragging(item.id)}
                  onPointerUp={() => setDragging(null)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      nudge(item.id, -1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      nudge(item.id, 1);
                    }
                  }}
                  className="hidden size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-fg/40 outline-none transition hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing md:flex"
                >
                  <DragIcon className="size-3.5" />
                </button>
              ) : (
                <span aria-hidden className="hidden size-6 shrink-0 md:block" />
              )
            ) : null}

            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={selected ? "true" : undefined}
              title={collapsed ? `${item.title ?? item.short} — ${item.hint}` : item.hint}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-1.5 pr-1 text-left text-[13px] font-medium outline-none transition",
                "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                collapsed && "md:justify-center md:px-0",
                selected
                  ? "text-foreground"
                  : off
                    ? "text-muted-fg/50 hover:text-foreground"
                    : "text-muted-fg hover:text-foreground"
              )}
            >
              <Icon className={cn("size-4 shrink-0", off && "opacity-60")} />
              <span
                className={cn("truncate whitespace-nowrap", collapsed && "md:hidden")}
              >
                {item.title ?? item.short}
              </span>
            </button>

            {moves && onToggleVisible && !collapsed ? (
              <button
                type="button"
                onClick={() => onToggleVisible(item.id)}
                aria-pressed={item.visible}
                aria-label={item.visible ? "Take off the page" : "Put on the page"}
                title={item.visible ? "Take off the page" : "Put on the page"}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded outline-none transition",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  item.visible
                    ? "text-muted-fg/40 hover:text-foreground"
                    : "text-muted-fg hover:text-foreground"
                )}
              >
                {item.visible ? (
                  <EyeIcon className="size-3.5" />
                ) : (
                  <EyeSlashIcon className="size-3.5" />
                )}
              </button>
            ) : null}
          </div>
        );
      })}

      {canAdd ? (
        <div className="shrink-0 md:mt-1">
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            aria-expanded={picking}
            className={cn(
              "flex w-full items-center gap-2 rounded-md py-1.5 pl-1.5 pr-1 text-left text-[13px] font-medium outline-none transition",
              "focus-visible:ring-[3px] focus-visible:ring-ring/40",
              picking ? "bg-muted text-foreground" : "text-muted-fg hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {/* The spacer keeps this line's icon under the rows' icons, which
                all sit to the right of a drag handle. */}
            {sortable ? <span aria-hidden className="hidden size-6 shrink-0 md:block" /> : null}
            <PlusIcon className="size-4 shrink-0" />
            <span className="truncate">Add a section</span>
          </button>

          {/*
            The list opens in place rather than as a popover. The sidebar is a
            narrow column that already scrolls, and a floating menu inside it
            would have to be positioned against a container that moves — this is
            a list under a button, which is what it looks like anyway.
          */}
          {picking ? (
            <ul className="mt-1 space-y-0.5 border-l border-border pl-1.5 md:ml-3">
              {choices?.map((choice) => {
                const { Icon } = choice;

                return (
                  <li key={choice.type}>
                    <button
                      type="button"
                      title={choice.hint}
                      onClick={() => {
                        onAdd?.(choice.type);
                        setPicking(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] text-muted-fg outline-none transition hover:bg-muted/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{choice.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
