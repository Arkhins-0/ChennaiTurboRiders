"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ROLE_LABELS, type AdminRole, type Grant } from "@/lib/roles";
import type { Site } from "@/lib/sites";
import { cn } from "@/lib/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LogOutIcon,
  MenuIcon,
  SearchLgIcon,
} from "@/admin/ui/icons";
import { ConfirmHost } from "@/admin/components/ConfirmHost";
import { Toasts } from "@/admin/components/Toasts";
import { JumpPalette, openJump, type JumpTarget } from "@/admin/components/shell/JumpPalette";
import { activeHref, crumbsFor, navFor } from "@/admin/components/shell/nav";

/**
 * The frame around every console screen, as a workspace's: a quiet grey
 * sidebar down the left (the console's name, a search that opens the jump
 * palette, the screens in groups, the open screen's own sections under them,
 * and the person at the foot), and over the page a slim bar with the
 * breadcrumbs. On a phone the sidebar slides in from the bar's menu button.
 *
 * ── Height ────────────────────────────────────────────────────────────────
 *
 * From `md:` the shell is exactly the window (`md:h-screen`) and the main pane
 * clips (`md:overflow-hidden`): the editors are full-height and scroll inside
 * their own panes, and a page that reads top to bottom scrolls itself inside
 * `ConsolePage`. `relative` makes the shell the containing block for anything
 * absolutely positioned inside it, and `data-admin-shell` is what the rule in
 * globals.css keys on to lock the document at that width — between them the
 * console can never scroll off the top of the window.
 */

/** The sidebar no longer collapses to a rail. Kept for what reads it. */
export function useSidebarCollapsed() {
  return false;
}

const RAIL_SLOT_ID = "admin-rail-slot";

/**
 * Puts a screen's own list of sections into the sidebar, under the
 * navigation, as its "on this page" area.
 *
 * The list belongs to the editor — it is the editor that knows which section is
 * open and what happens when one is picked — but it belongs *visually* to the
 * sidebar, so it is rendered there through a portal rather than passed down
 * through the layout, which cannot hand props to a page. The sidebar is always
 * mounted (on a phone it is off-canvas, not absent), so the slot always exists.
 */
export function AdminRailSlot({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => setHost(document.getElementById(RAIL_SLOT_ID)), []);

  return host ? createPortal(children, host) : null;
}

/** The public site, for the bar's "View site". Unknown in the browser unless set. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase() || "?";
}

export function AdminShell({
  username,
  role,
  grants,
  sites,
  children,
}: {
  username: string;
  role: AdminRole;
  /** Every (site, module) pair this account holds. Empty for an owner. */
  grants: Grant[];
  /** Every site, so the navigation can be built from what exists. */
  sites: Site[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  const groups = useMemo(() => navFor({ role, grants }, sites), [role, grants, sites]);
  const current = activeHref(pathname, groups);
  const trail = crumbsFor(pathname, groups);
  const targets: JumpTarget[] = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title ?? "Console" }))),
    [groups]
  );

  // A new screen closes the phone's drawer.
  useEffect(() => setDrawer(false), [pathname]);

  // Escape closes it too.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  async function handleSignOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const parent = trail.length > 1 ? [...trail].reverse().find((crumb, index) => index > 0 && crumb.href) : undefined;

  return (
    <div
      data-admin-shell
      data-console
      className="relative min-h-screen bg-background font-ui text-[14px] text-foreground md:flex md:h-screen md:overflow-hidden"
    >
      {/* The phone's scrim. The sidebar itself is never unmounted. */}
      {drawer ? (
        <button
          type="button"
          aria-label="Close the menu"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setDrawer(false)}
        />
      ) : null}

      <aside
        aria-label="Console"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-rail transition-transform duration-200 ease-out motion-reduce:transition-none",
          "md:static md:z-auto md:h-screen md:w-60 md:max-w-none md:shrink-0 md:translate-x-0",
          drawer ? "translate-x-0 shadow-pop" : "-translate-x-full"
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-3">
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-foreground/[0.05]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logos/CTR_New_yellow.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md bg-[#0a0a0a] object-contain p-0.5"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">CTR Console</span>
              <span className="block truncate text-[11px] text-faint">Chennai Turbo Riders</span>
            </span>
          </Link>
        </div>

        <div className="shrink-0 px-3 pb-2">
          <button
            type="button"
            onClick={openJump}
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[13px] text-faint shadow-sm transition-colors hover:text-foreground"
          >
            <SearchLgIcon className="size-4" />
            <span className="flex-1 text-left">Search or jump to</span>
            <kbd className="rounded border border-border px-1 text-[10px] font-medium">Ctrl K</kbd>
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1"
          onClick={(event) => {
            // Picking a section on a phone closes the drawer onto it.
            if ((event.target as HTMLElement).closest("[data-rail-select]")) setDrawer(false);
          }}
        >
          <nav aria-label="Screens" className="space-y-4">
            {groups.map((group) => (
              <div key={group.title ?? "main"}>
                {group.title ? (
                  <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wide text-faint">
                    {group.title}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const on = item.href === current;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.hint}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                          on
                            ? "bg-primary/10 text-primary hover:bg-primary/[0.14]"
                            : "text-muted-fg hover:bg-foreground/[0.05] hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* The open screen's own sections ("on this page"), portalled in by
              the editor through AdminRailSlot. Takes no room while empty. */}
          <div id={RAIL_SLOT_ID} className="mt-4 border-t border-border pt-3 empty:hidden" />
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-1.5">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
            >
              {initials(username)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium">{username}</span>
              <span className="block truncate text-[11px] text-faint">{ROLE_LABELS[role]}</span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOutIcon className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:h-screen md:min-h-0">
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-12 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              className="-ml-1.5 grid size-8 place-items-center rounded-lg text-muted-fg transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
              aria-label="Open the menu"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <MenuIcon className="size-5" />
            </button>

            {/* On a phone a trail doesn't fit: the step above, as a way back, or the page's name. */}
            <div className="min-w-0 flex-1 text-[13px] sm:hidden">
              {parent?.href ? (
                <Link href={parent.href} className="flex min-h-9 min-w-0 items-center gap-1 text-muted-fg">
                  <ChevronLeftIcon className="size-4 shrink-0" />
                  <span className="truncate">{parent.label}</span>
                </Link>
              ) : (
                <span className="block truncate font-medium">{trail[trail.length - 1]?.label}</span>
              )}
            </div>

            <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 text-[13px] sm:block">
              <ol className="flex min-w-0 items-center gap-1">
                {trail.map((crumb, index) => {
                  const last = index === trail.length - 1;
                  return (
                    <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
                      {index > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 text-faint" /> : null}
                      {!last && crumb.href ? (
                        <Link
                          href={crumb.href}
                          title={crumb.label}
                          className="max-w-[14rem] truncate rounded px-1 text-faint hover:bg-foreground/[0.05] hover:text-foreground"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          title={crumb.label}
                          aria-current={last ? "page" : undefined}
                          className={cn("truncate px-1", last ? "font-medium text-foreground" : "text-faint")}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            <button
              type="button"
              onClick={openJump}
              className="grid size-8 place-items-center rounded-lg text-muted-fg transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
              aria-label="Search"
            >
              <SearchLgIcon className="size-4" />
            </button>

            {SITE_URL ? (
              <a
                href={SITE_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-high"
              >
                <ExternalLinkIcon className="size-4" />
                <span className="hidden sm:inline">View site</span>
              </a>
            ) : null}
          </div>
        </header>

        {/* An editor is drawn edge to edge in panes of its own, so it gets a
            small inset here; a ConsolePage (data-console-page) pads and scrolls
            itself, so it does not. */}
        <main className="min-h-0 min-w-0 flex-1 md:overflow-hidden [&>:not([data-console-page])]:p-2 md:[&>:not([data-console-page])]:p-3">
          {children}
        </main>
      </div>

      <JumpPalette targets={targets} />
      {/* The one place every screen's toast() and askConfirm() show. */}
      <Toasts />
      <ConfirmHost />
    </div>
  );
}
