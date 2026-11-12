/*
 * The console's map: the sidebar, the breadcrumbs and the jump palette all read
 * it. Shared by the server and the browser — the dashboard asks the same
 * questions of it — so nothing here may import `server-only`.
 *
 * Plain root paths: the console has a hostname to itself, so its screens ARE
 * the root. Nothing here knows about the mount point the router happens to use.
 *
 * Each row says what it takes to open it, and the list is filtered by the
 * signed-in account before it is drawn — a screen an account cannot open is not
 * in its sidebar at all. That is a courtesy rather than the enforcement: the
 * screen itself answers `notFound()` and the routes behind it answer 403, so
 * typing the address gets nobody anywhere.
 */

import type { ComponentType } from "react";
import {
  canEdit,
  canManageAdmins,
  canManageTeam,
  canSeeAnySite,
  type GrantModule,
  type Scoped,
} from "@/lib/roles";
import type { Site } from "@/lib/sites";
import {
  AccountsIcon,
  ArticlesIcon,
  CircuitsIcon,
  CoAdminsIcon,
  DashboardIcon,
  DriversIcon,
  MediaIcon,
  QrIcon,
  SeasonsIcon,
  SpreadsheetIcon,
  SponsorsIcon,
  TeamIcon,
} from "@/admin/ui/icons";

export type NavIcon = ComponentType<{ className?: string }>;

export type NavItem = {
  href: string;
  /** What the row says. */
  label: string;
  icon: NavIcon;
  /** One line on what is there. The palette shows it and searches it. */
  hint: string;
};

/** A group of rows under an 11px heading; `null` for the untitled first group. */
export type NavGroup = { title: string | null; items: NavItem[] };

/**
 * The screens of one site, grouped. The permission logic is the one the old
 * sidebar had: a row needs the grant, and the three SITE_MODULES (articles,
 * events, circuits) need the site to have the module switched on as well.
 * Identity, drivers and sponsors are on every site by construction — see the
 * note on GRANT_MODULES in src/lib/roles.ts.
 */
function siteGroups(site: Site, scope: Scoped, qualify: boolean): NavGroup[] {
  const base = `/site/${site.slug}`;
  const has = (module: GrantModule) => canEdit(scope, site.id, module);
  const on = (module: string) => (site.modules as readonly string[]).includes(module);
  const title = (name: string) => (qualify ? `${site.name} · ${name}` : name);

  const team: NavItem[] = [];
  if (has("identity")) {
    team.push({ href: `${base}/identity`, label: "Team & site", icon: TeamIcon, hint: "The name, the hero and about bands, the car, the timeline" });
  }
  if (has("drivers")) {
    team.push({ href: `${base}/drivers`, label: "Drivers", icon: DriversIcon, hint: "The roster and each driver's page" });
  }
  if (has("sponsors")) {
    team.push({ href: `${base}/sponsors`, label: "Sponsors", icon: SponsorsIcon, hint: "Partners by tier, with their logos" });
  }

  const racing: NavItem[] = [];
  if (on("events") && has("events")) {
    racing.push({ href: `${base}/events`, label: "Seasons", icon: SeasonsIcon, hint: "Leagues, rounds, lineups and results" });
  }
  if (on("circuits") && has("circuits")) {
    racing.push({ href: `${base}/tracks`, label: "Circuits", icon: CircuitsIcon, hint: "Venues, maps and lap records" });
  }

  const content: NavItem[] = [];
  if (on("articles") && has("articles")) {
    content.push({ href: `${base}/articles`, label: "Articles", icon: ArticlesIcon, hint: "News and race reports" });
  }

  const people: NavItem[] = [];
  if (canManageTeam(scope, site.id)) {
    people.push({ href: `${base}/team`, label: "Co-admins", icon: CoAdminsIcon, hint: "Who else edits this site, and what" });
  }

  return [
    { title: title("Team"), items: team },
    { title: title("Racing"), items: racing },
    { title: title("Content"), items: content },
    { title: title("People"), items: people },
  ];
}

/** Can this account take any export? The Exports page lists only the ones it can. */
export function canExportAny(scope: Scoped, site: Site): boolean {
  return (["drivers", "sponsors", "events"] as const).some((module) => canEdit(scope, site.id, module));
}

/** The sites this account can open at least one screen of. */
export function reachableSites(scope: Scoped, sites: Site[]): Site[] {
  return sites.filter((site) => siteGroups(site, scope, false).some((group) => group.items.length > 0));
}

/**
 * Every group this account may open, in the sidebar's order: Dashboard, Team,
 * Racing, Content, Tools, People.
 *
 * There is one site on this deployment, and its groups are drawn bare. Should a
 * second ever exist, each site's group titles carry its name instead.
 */
export function navFor(scope: Scoped, sites: Site[]): NavGroup[] {
  const reachable = reachableSites(scope, sites);
  const qualify = reachable.length > 1;
  const perSite = reachable.map((site) => siteGroups(site, scope, qualify));

  const main: NavGroup = {
    title: null,
    items: [{ href: "/", label: "Dashboard", icon: DashboardIcon, hint: "The next race and what needs doing" }],
  };

  // Media is cross-cutting and global; it sits with the first site's content.
  const media: NavItem[] = canSeeAnySite(scope)
    ? [{ href: "/media", label: "Media", icon: MediaIcon, hint: "Photos, logos and files, by folder" }]
    : [];

  const tools: NavItem[] = [];
  if (canSeeAnySite(scope)) {
    tools.push({ href: "/qr", label: "QR codes", icon: QrIcon, hint: "Make a QR code for a page and download it" });
  }
  if (reachable.some((site) => canExportAny(scope, site))) {
    tools.push({ href: "/exports", label: "Exports", icon: SpreadsheetIcon, hint: "Drivers, sponsors, rounds and history as CSV; the calendar as .ics" });
  }

  const accounts: NavItem[] = canManageAdmins(scope)
    ? [{ href: "/admins", label: "Accounts", icon: AccountsIcon, hint: "Sign-ins, roles and what each may edit" }]
    : [];

  const groups: NavGroup[] = [main];
  perSite.forEach(([team, racing, content], index) => {
    groups.push(team, racing, index === 0 ? { ...content, items: [...content.items, ...media] } : content);
  });
  if (perSite.length === 0 && media.length > 0) groups.push({ title: "Content", items: media });
  groups.push({ title: "Tools", items: tools });

  const people = perSite.map((site) => site[3]);
  if (qualify) {
    groups.push(...people);
    groups.push({ title: "People", items: accounts });
  } else {
    groups.push({ title: "People", items: [...(people[0]?.items ?? []), ...accounts] });
  }

  return groups.filter((group) => group.items.length > 0);
}

/** Steps below a screen that are pages with a name of their own, not a record. */
const SUBPAGES: Record<string, string> = {
  rounds: "Rounds",
};

/** One step of the breadcrumbs. The last is the page itself and has no link. */
export type Crumb = { label: string; href?: string };

/**
 * The breadcrumbs for a path: the group the page is in, then each known step by
 * its label; anything unknown after that (an id, a slug) reads "Details". The
 * `/site` and `/site/<slug>` prefixes are not pages and are skipped.
 */
export function crumbsFor(pathname: string, groups: NavGroup[]): Crumb[] {
  const items = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));
  const byHref = new Map(items.map((item) => [item.href, item]));

  if (pathname === "/" || pathname === "") return [{ label: "Dashboard" }];

  const parts = pathname.split("/").filter(Boolean);
  const out: Crumb[] = [];

  parts.forEach((_, index) => {
    const href = `/${parts.slice(0, index + 1).join("/")}`;
    if (/^\/site(\/[^/]+)?$/.test(href)) return;

    const known = byHref.get(href);
    if (known) {
      if (out.length === 0 && known.group) out.push({ label: known.group });
      out.push({ label: known.label, href });
    } else if (out.length > 0) {
      out.push({ label: SUBPAGES[parts[index]] ?? "Details", href });
    }
  });

  if (out.length === 0) return [{ label: "Details" }];

  // The page itself is not a link.
  const last = out[out.length - 1];
  out[out.length - 1] = { label: last.label };
  return out;
}

/** The row a path belongs to: itself, or the deepest row it sits under. */
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const match =
        item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!best || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
