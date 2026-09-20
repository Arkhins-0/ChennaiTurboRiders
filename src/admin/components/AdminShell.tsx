"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ROLE_LABELS,
  canEdit,
  canManageAdmins,
  canManageTeam,
  canSeeAnySite,
  type AdminRole,
  type Grant,
} from "@/lib/roles";
import type { Site } from "@/lib/sites";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import {
  CalendarIcon,
  CaretDownIcon,
  FlagIcon,
  FolderIcon,
  HandshakeIcon,
  MapIcon,
  NewsIcon,
  PanelIcon,
  SignOutIcon,
  UsersIcon,
} from "@/admin/ui/icons";
import { Media } from "@/components/ui/Media";

/**
 * Chrome around every admin screen.
 *
 * The sidebar floats: it is a card with a border, inset from the edges, with the
 * page colour showing all the way around it. That inset is what separates the
 * navigation from the work without a hard full-height rule down the screen.
 *
 * One left column holds both lists, and they are stacked by how often they are
 * used: the open screen's sections at the top, where the hand goes all day, and
 * the screen switcher and account buttons at the foot, out of the way. The
 * sections come from the page itself — see AdminRailSlot below.
 *
 * It collapses to a rail of icons rather than to nothing. A pane that vanishes
 * needs a button somewhere else to bring it back; a rail carries its own, and
 * the sections stay clickable while collapsed, which is what you actually want
 * when the reason for collapsing was to give the preview more room.
 *
 * A fixed column from `md:` up and a scrolling chip row below that, which keeps
 * the whole editor above the fold on a laptop without breaking on a phone.
 */

/** Remembered across visits: a collapsed sidebar is a preference, not a mode. */
const COLLAPSED_KEY = "ctr-admin-sidebar-collapsed";

/** Same, for the screen switcher at the foot of it. */
const PAGES_OPEN_KEY = "ctr-admin-pages-open";

/** So the header button can point `aria-controls` at what it opens. */
const PAGES_DRAWER_ID = "admin-pages-drawer";

const CollapsedContext = createContext(false);

/** True while the sidebar is a rail. Read by whatever is portalled into it. */
export function useSidebarCollapsed() {
  return useContext(CollapsedContext);
}

/**
 * One entry per admin screen. Add a page, add a line.
 *
 * Plain root paths: the admin has a hostname to itself, so its screens ARE the
 * root. Nothing here knows about the mount point the router happens to use.
 *
 * Each entry says what it takes to open it, and the list is filtered by the
 * signed-in account before it is drawn — a screen an account cannot open is not
 * in its sidebar at all. That is a courtesy rather than the enforcement: the
 * screen itself answers `notFound()` and the routes behind it answer 403, so
 * typing the address gets nobody anywhere.
 */
type NavItem = {
  href: string;
  /**
   * What the row says. BARE — "Articles", not "INCRC · Articles".
   *
   * The sport's name is `site` below, and which of the two a reader sees depends
   * on where the row is drawn: inside its sport's group the name is already
   * overhead, and in the flat lists — the phone's chip row, the "where you are"
   * line — `qualify` puts it back.
   */
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  /** Which sport this row belongs to, for grouping. Absent for the global rows. */
  siteId?: string;
  /** That sport's name, for the group's heading and for `qualify`. */
  site?: string;
};

/** "INCRC · Articles" — for a list with no heading above it to say which sport. */
function qualify(item: NavItem): string {
  return item.site ? `${item.site} · ${item.label}` : item.label;
}

/**
 * The screens of one sport.
 *
 * `NAV` used to be a constant: eight rows with a `PageKey` on each, filtered by
 * what the account held. It cannot be a constant any more, because the rows
 * depend on which sports exist, which modules each has switched on, and which
 * of them this account can reach — three things that are rows in a table now.
 *
 * So it is built. The order is fixed here rather than taken from `site.modules`
 * so that two sports with the same modules always read the same way down the
 * list.
 */
function siteNav(site: Site, scope: { role: AdminRole; grants: Grant[] }): NavItem[] {
  const base = `/site/${site.slug}`;
  const has = (module: Parameters<typeof canEdit>[2]) => canEdit(scope, site.id, module);
  const on = (module: string) => (site.modules as readonly string[]).includes(module);

  const rows: NavItem[] = [];

  /*
   * No `on(...)` check beside the `has(...)` on these three: unlike the
   * circuits they are not SITE_MODULES, so there is no row in ctr.site_modules
   * to switch them off — every site has a name and a roster, even if the roster
   * is empty. See the note on GRANT_MODULES in src/lib/roles.ts.
   */
  if (has("identity")) {
    rows.push({ href: `${base}/identity`, label: "Team & site", icon: FlagIcon, siteId: site.id });
  }
  if (has("drivers")) {
    rows.push({ href: `${base}/drivers`, label: "Drivers", icon: UsersIcon, siteId: site.id });
  }
  if (has("sponsors")) {
    rows.push({ href: `${base}/sponsors`, label: "Sponsors", icon: HandshakeIcon, siteId: site.id });
  }
  if (on("circuits") && has("circuits")) {
    rows.push({ href: `${base}/tracks`, label: "Circuits", icon: MapIcon, siteId: site.id });
  }
  if (on("events") && has("events")) {
    rows.push({ href: `${base}/events`, label: "Season", icon: CalendarIcon, siteId: site.id });
  }
  if (on("articles") && has("articles")) {
    rows.push({ href: `${base}/articles`, label: "Articles", icon: NewsIcon, siteId: site.id });
  }
  if (canManageTeam(scope, site.id)) {
    rows.push({ href: `${base}/team`, label: "Co-admins", icon: UsersIcon, siteId: site.id });
  }

  return rows;
}

/**
 * Every row this account may open, sports first and the global screens last.
 *
 * Each sport's rows carry its name rather than having it pasted onto every
 * label. That used to be the only way to tell two "Articles" apart in one flat
 * list; the drawer groups them under a heading per sport now, so the name is
 * said once instead of on every row — and `qualify` puts it back for the two
 * places that are still a flat list.
 */
function allowedNav(
  scope: { role: AdminRole; grants: Grant[] },
  sites: Site[]
): NavItem[] {
  const reachable = sites.filter((site) => siteNav(site, scope).length > 0);

  // Typed rather than inferred: the global rows pushed below carry no `site`,
  // and an array inferred from the sports' rows alone would require one.
  const rows: NavItem[] = reachable.flatMap((site) =>
    siteNav(site, scope).map((item) => ({ ...item, site: site.name }))
  );

  /*
   * `FolderIcon` rather than `ImagesIcon`: the latter is already the landing
   * page's glyph and two rows sharing one shape defeats the point of the rail.
   * It is also what the "Library" button inside every image field wears, so the
   * glyph and the destination match.
   */
  if (canSeeAnySite(scope)) {
    rows.push({ href: "/media", label: "Media", icon: FolderIcon });
  }
  if (canManageAdmins(scope)) {
    rows.push({ href: "/admins", label: "Accounts", icon: UsersIcon });
  }
  return rows;
}

const RAIL_SLOT_ID = "admin-rail-slot";

/**
 * Puts a screen's own list of sections at the top of the sidebar.
 *
 * The list belongs to the editor — it is the editor that knows which section is
 * open and what happens when one is picked — but it belongs *visually* to the
 * sidebar, so it is rendered here through a portal rather than passed down
 * through the layout, which cannot hand props to a page.
 *
 * Nothing is drawn until the slot exists, so the first paint is the sidebar
 * without its sections; it fills in on hydration.
 */
export function AdminRailSlot({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => setHost(document.getElementById(RAIL_SLOT_ID)), []);

  return host ? createPortal(children, host) : null;
}

/**
 * The screen switcher, as a drawer that pulls up out of the sidebar's foot.
 *
 * Modelled on the collapsible panes in VS Code's sidebar: a header row you click,
 * with the list sliding out above the account block rather than sitting open all
 * day. Switching screens is something you do a handful of times a session, and
 * it was taking permanent room from the section list, which is what the hand is
 * actually on.
 *
 * Shut, the header still says where you are, so tucking the list away never
 * costs you the answer to "which page am I editing?".
 *
 * The open/shut state is remembered, like the sidebar's own width — it is a
 * preference, not a mode.
 *
 * The height animates through `grid-template-rows: 0fr → 1fr` rather than a
 * max-height guess, so it opens to exactly the list's height however many
 * screens there turn out to be.
 *
 * It behaves the same collapsed to a rail — the state that most needs the room
 * back is the one where the pages had been sitting open. What a 52px rail cannot
 * fit is the word beside the caret, so that is what goes: the handle stays, the
 * label moves into the tooltip, and the caret still points the way the list will
 * travel.
 */
/** One sport's screens, under its own heading. */
type NavGroup = { id: string; name: string; items: NavItem[] };

/**
 * The rows, split into a group per sport with the global screens left loose.
 *
 * Order is the order `allowedNav` produced — sites in `listSites` order, then
 * Media, Sports and Accounts — so the drawer reads the same way down however
 * many sports there turn out to be.
 */
function groupNav(nav: NavItem[]): { groups: NavGroup[]; global: NavItem[] } {
  const groups: NavGroup[] = [];

  for (const item of nav) {
    if (!item.siteId) continue;

    const found = groups.find((group) => group.id === item.siteId);
    if (found) found.items.push(item);
    else groups.push({ id: item.siteId, name: item.site ?? "", items: [item] });
  }

  return { groups, global: nav.filter((item) => !item.siteId) };
}

function PagesDrawer({
  nav,
  pathname,
  collapsed,
}: {
  /** Already filtered to what this account may open. */
  nav: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(window.localStorage.getItem(PAGES_OPEN_KEY) === "1");
  }, []);

  function toggle() {
    setOpen((current) => {
      window.localStorage.setItem(PAGES_OPEN_KEY, current ? "0" : "1");
      return !current;
    });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = nav.find((item) => isActive(item.href));

  const { groups, global } = groupNav(nav);

  /*
   * One sport is not a hierarchy.
   *
   * A single group whose heading repeats what the whole drawer is about costs a
   * click and a line to say nothing. The rows go flat until there is a second
   * sport to tell them apart from — which is the same judgement the labels used
   * to make for themselves before the headings took it over.
   */
  const nested = groups.length > 1;

  /*
   * Which sports are open. The one being edited always starts open; after that
   * it is whatever was clicked.
   *
   * Not remembered across visits, unlike the drawer above it. What somebody
   * wants open is almost always "the sport I am in", and that is derivable —
   * remembering would mostly re-derive the same answer, and would sometimes
   * open on a page whose own group had been left shut.
   */
  const [openSites, setOpenSites] = useState<string[]>([]);
  const activeSite = current?.siteId;

  useEffect(() => {
    if (!activeSite) return;
    setOpenSites((sites) => (sites.includes(activeSite) ? sites : [...sites, activeSite]));
  }, [activeSite]);

  function toggleSite(id: string) {
    setOpenSites((sites) =>
      sites.includes(id) ? sites.filter((entry) => entry !== id) : [...sites, id]
    );
  }

  /**
   * One row.
   *
   * `bare` is the label without its sport in front. Inside a group the heading
   * has already said which sport, and repeating it on all eight rows is the
   * noise the grouping exists to remove — but the TOOLTIP is qualified either
   * way, because collapsed to a rail there is no heading and no label at all.
   */
  const renderLink = (item: NavItem, bare: boolean) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={qualify(item)}
        className={cn(
          "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition",
          collapsed && "md:justify-center md:px-0",
          active
            ? "bg-muted text-foreground"
            : "text-muted-fg hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className={cn("truncate", collapsed && "md:hidden")}>
          {bare ? item.label : qualify(item)}
        </span>
      </Link>
    );
  };

  /**
   * Every row, one after another. The phone's chip row, and the rail.
   *
   * Qualified only when there is more than one sport to tell apart — which is
   * the judgement the labels used to make for themselves. On a deployment with
   * one sport "Decks" is unambiguous, and "INCRC · Decks" on every row is noise
   * until the day it is not.
   */
  const flat = nav.map((item) => renderLink(item, !nested));

  /** What a row is called where there is no heading above it to say the sport. */
  const name = (item: NavItem) => (nested ? qualify(item) : item.label);

  return (
    <div className="md:contents">
      {/* Below md the sidebar is a scrolling chip row — there is no foot for a
          drawer to pull up out of, so the pages stay a plain row. Flat, and
          qualified: a row of chips has no headings to group them under. */}
      <nav aria-label="Pages" className="flex gap-1 overflow-x-auto md:hidden">
        {flat}
      </nav>

      <div className="hidden md:block">
        <div
          id={PAGES_DRAWER_ID}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          {/* The row collapses to nothing, so its content must be clipped —
              without this the links stay visible at zero height. */}
          <div className="overflow-hidden">
            <nav aria-label="Pages" className="flex flex-col gap-1 pb-1">
              {/*
                Collapsed to a 52px rail there is nowhere to put a heading, and
                a group whose contents are icons and whose title is invisible is
                a control that does nothing. So the rail is the flat list, which
                is what it has always been.
              */}
              {!nested || collapsed
                ? flat
                : (
                  <>
                    {groups.map((group) => {
                      const openHere = openSites.includes(group.id);
                      const here = group.items.find((item) => isActive(item.href));

                      return (
                        <div key={group.id}>
                          <button
                            type="button"
                            onClick={() => toggleSite(group.id)}
                            aria-expanded={openHere}
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] outline-none transition",
                              "hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                              here ? "text-foreground" : "text-muted-fg hover:text-foreground"
                            )}
                          >
                            <CaretDownIcon
                              className={cn(
                                "size-3 shrink-0 transition-transform motion-reduce:transition-none",
                                !openHere && "-rotate-90"
                              )}
                            />
                            <span className="min-w-0 truncate">{group.name}</span>

                            {/* Where you are, for when this sport is shut. */}
                            {!openHere && here ? (
                              <span className="ms-auto min-w-0 truncate normal-case tracking-normal text-foreground">
                                {here.label}
                              </span>
                            ) : null}
                          </button>

                          <div
                            className={cn(
                              "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                              openHere ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                            )}
                          >
                            <div className="overflow-hidden">
                              {/* The rule down the left is what makes a row read
                                  as belonging to the sport above it rather than
                                  as another sport. */}
                              <div className="ms-3 flex flex-col gap-1 border-s border-border ps-2 pt-1">
                                {group.items.map((item) => renderLink(item, true))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Media, Sports and Accounts belong to no sport, so they sit
                        at the foot with nothing above them — a heading would have
                        to invent a name for "the rest". */}
                    {global.length > 0 ? (
                      <div className="mt-1 flex flex-col gap-1 border-t border-border pt-1">
                        {global.map((item) => renderLink(item, true))}
                      </div>
                    ) : null}
                  </>
                )}
            </nav>
          </div>
        </div>

        {/*
          The handle. One button in both states — a rail 52px wide has no room
          for a word beside the caret, so what it drops is the label, not the
          drawer. The tooltip carries the name in its place, and the caret still
          points the way the list will move.
        */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={PAGES_DRAWER_ID}
          title={current ? `Pages — ${name(current)}` : "Pages"}
          className={cn(
            "flex w-full items-center rounded-md py-1.5 text-[11px] font-medium text-muted-fg outline-none transition hover:bg-muted/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
            collapsed ? "justify-center px-0" : "gap-1.5 px-2 text-left"
          )}
        >
          <CaretDownIcon
            className={cn("size-3.5 shrink-0 transition-transform", !open && "rotate-180")}
          />

          {collapsed ? (
            <span className="sr-only">Pages</span>
          ) : (
            <>
              <span>Pages</span>

              {/* Where you are, for when the list is shut. Qualified, because
                  with the drawer shut there is no heading to say which sport. */}
              {!open && current ? (
                <span className="ms-auto min-w-0 truncate text-foreground">{name(current)}</span>
              ) : null}
            </>
          )}
        </button>
      </div>
    </div>
  );
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
  /** Every (sport, module) pair this account holds. Empty for an owner. */
  grants: Grant[];
  /** Every sport, so the navigation can be built from what exists. */
  sites: Site[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const nav = allowedNav({ role, grants }, sites);

  // Starts expanded and corrects itself on mount. Reading localStorage during
  // render would differ from what the server drew and break hydration.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      window.localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
      return !current;
    });
  }

  async function handleSignOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    /*
     * md:h-screen + overflow-hidden so the editor and the preview each scroll on
     * their own instead of the whole document scrolling as one.
     *
     * ── Two things that had to be added to make that true ─────────────────
     *
     * `relative`. `overflow: hidden` on an element that is NOT positioned does
     * not clip an absolutely positioned descendant whose containing block is
     * further up — that descendant resolves against the initial containing
     * block, escapes this box entirely, and adds its height to the DOCUMENT's
     * scrollable area. The console then scrolled past its own bottom into empty
     * space, taking the whole interface off the top of the window. One word
     * makes this the containing block, so there is nowhere to escape to.
     *
     * `data-admin-shell`. Even clipped, nothing stopped the document itself from
     * being taller than the viewport. The rule keyed on this attribute in
     * globals.css locks `html` and `body` at the same breakpoint, so the page
     * cannot scroll as a whole whatever a child does. Belt and braces, and the
     * braces are the part that cannot be undone by a future descendant.
     */
    <CollapsedContext.Provider value={collapsed}>
      <div
        data-admin-shell
        className="relative min-h-screen bg-background font-ui text-foreground md:flex md:h-screen md:gap-2 md:overflow-hidden md:p-2"
      >
      {/* Wider at xl: the section rows carry a drag handle and an eye, and the
          labels are what gives way when they do not fit. Collapsed, it is a rail
          just wide enough for the icons. */}
      <aside
        className={cn(
          "relative flex flex-col gap-2 border-b border-border bg-card p-2 transition-[width] md:shrink-0 md:rounded-lg md:border md:border-border",
          collapsed ? "md:w-[52px]" : "md:w-52 xl:w-60"
        )}
      >
        {/*
          Lifted out of the flow rather than given a row of its own. In flow it
          cost a full row for one 28px icon, and since it is right-aligned the
          rest of that row was blank — a band of nothing above every screen's
          section list. Floated, it sits level with the list's own heading, which
          is short and left-aligned and so never reaches it.

          Collapsed there IS no heading to sit beside, so it centres over the
          icons and the rail below reserves the room for it.
        */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          className={cn(
            "absolute top-2 z-10 hidden md:flex",
            collapsed ? "left-1/2 -translate-x-1/2" : "right-2"
          )}
        >
          <PanelIcon />
        </Button>

        {/* Filled by the open screen. Takes the height the account block leaves. */}
        <div
          id={RAIL_SLOT_ID}
          className={cn(
            "min-h-0 md:flex-1 md:overflow-y-auto",
            collapsed ? "md:pt-10" : "md:pt-1"
          )}
        />

        {/* Everything below here sits at the foot of the column. */}
        <div className="hidden h-px bg-border md:block" />

        <PagesDrawer nav={nav} pathname={pathname} collapsed={collapsed} />

        <div className="hidden h-px bg-border md:block" />

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5",
            collapsed && "md:justify-center md:px-0"
          )}
          title={username}
        >
          <Media
            src="/images/brand/ctr-logo.webp"
            alt=""
            aria-hidden
            className="h-7 w-auto shrink-0"
          />
          <div className={cn("min-w-0", collapsed && "md:hidden")}>
            <p className="truncate text-[13px] font-medium leading-tight text-foreground">
              {username}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-fg">
              {ROLE_LABELS[role]}
            </p>
          </div>
        </div>

        <div className="flex gap-1 md:flex-col">
          <Button
            variant="ghost"
            size={collapsed ? "icon-sm" : "sm"}
            onClick={handleSignOut}
            title="Sign out"
            className={cn(
              "hover:text-destructive",
              collapsed ? "md:mx-auto" : "justify-start"
            )}
          >
            <SignOutIcon />
            <span className={collapsed ? "md:hidden" : undefined}>Sign out</span>
          </Button>
        </div>
      </aside>

      {/* No padding: each screen sets its own, because the landing editor fills
          the space edge to edge. */}
        <main className="min-w-0 flex-1 md:overflow-hidden">{children}</main>
      </div>
    </CollapsedContext.Provider>
  );
}
