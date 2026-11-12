"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon, SearchLgIcon } from "@/admin/ui/icons";
import type { NavIcon } from "./nav";

export type JumpTarget = { href: string; label: string; icon: NavIcon; hint?: string; group: string };

const OPEN_EVENT = "ctr-console:jump";

/** Opens the palette from anywhere (the sidebar's search button sends it). */
export const openJump = () => window.dispatchEvent(new Event(OPEN_EVENT));

/**
 * Quick jump: Ctrl+K (⌘K on a Mac) or the sidebar's search opens it; type to
 * narrow the screens (by name, by what they hold, by group), arrows to move,
 * Enter to go, Escape to close.
 */
export function JumpPalette({ targets }: { targets: JumpTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAt(0);
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? targets.filter((target) => `${target.label} ${target.hint ?? ""} ${target.group}`.toLowerCase().includes(q))
      : targets;
  }, [query, targets]);

  const go = (target: JumpTarget | undefined) => {
    if (!target) return;
    setOpen(false);
    router.push(target.href);
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-4 pt-[12vh] font-ui backdrop-blur-[2px]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Jump to a screen"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <SearchLgIcon className="size-4 text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setAt(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setAt((current) => Math.min(current + 1, found.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setAt((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                go(found[at]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Jump to a screen"
            aria-label="Jump to a screen"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-faint">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {found.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-faint">No screen matches.</p>
          ) : null}

          {found.map((target, index) => {
            const head = target.group !== lastGroup ? target.group : null;
            lastGroup = target.group;
            const Icon = target.icon;
            const on = index === at;

            return (
              <div key={target.href}>
                {head ? (
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">{head}</p>
                ) : null}
                <button
                  type="button"
                  onMouseEnter={() => setAt(index)}
                  onClick={() => go(target)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none",
                    on && "bg-primary/10"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-faint")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{target.label}</span>
                    {target.hint ? <span className="block truncate text-xs text-faint">{target.hint}</span> : null}
                  </span>
                  {on ? <ChevronRightIcon className="size-4 text-primary" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
