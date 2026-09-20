/**
 * Who may edit what.
 *
 * The admin used to be one thing: signed in meant every screen. Then it became
 * three roles divided by the THING being edited — `pages` plus a list of page
 * keys, or `registrations`, or `owner` — which was the right axis for a site
 * with one sport, because "the page" and "the sport" were the same thing.
 *
 * With more than one sport that axis is short by a dimension. "May edit decks"
 * has to mean "may edit INCRC's decks", not everybody's, or the first
 * pickleball admin can rewrite the championship. So a scope is now a pair:
 *
 *     (site, module)
 *
 * and the role collapses to the only distinction genuinely about the ACCOUNT
 * rather than about a site:
 *
 *   owner    the super admin. Creates sites, creates sport admins, sees all.
 *   member   reaches exactly what their grants say, and nothing else.
 *
 * ── The three shapes a member has ─────────────────────────────────────────
 *
 *   sport admin   one grant: (site, "*"). Everything on that site, including
 *                 handing pieces of it to co-admins — but only on that site,
 *                 and never another "*".
 *   co-admin      one grant per module: (site, "articles"), (site, "drivers")…
 *   nothing       no grants. Signs in, reaches no screen. Carried faithfully
 *                 from the old data, where an account could already be scoped
 *                 to nothing at all.
 *
 * ── What is deliberately NOT a module ─────────────────────────────────────
 *
 * `media`. A folder belongs to a site, so "may they open incrc/decks/?" is
 * already answered by "have they any grant on incrc?". A separate grant would
 * be a second source of truth for a question the first one answers, and the two
 * would drift — which is exactly the failure `PAGE_KEYS` doubling as the folder
 * list was introduced to avoid.
 *
 * The predicates below are the only place a role or a grant is interpreted.
 * Everything else — the navigation, the console screens, every route guard —
 * asks one of them, so there is one answer to "may they?" rather than one per
 * call site.
 *
 * Shared by the server and the browser, so nothing here may import
 * `server-only`: the navigation is a client component and asks these too.
 */

import { oneOf } from "@/lib/normalise";
import { SITE_MODULES, type SiteModule } from "@/lib/sites";

export const ADMIN_ROLES = ["owner", "member"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  member: "Team member",
};

export const ROLE_HINTS: Record<AdminRole, string> = {
  owner: "Every sport, every screen, and the accounts.",
  member: "Only the sports and screens granted below.",
};

/**
 * Everything an account can be granted on one site.
 *
 * `SITE_MODULES` are the features a site may or may not have. These three are
 * on every site by construction, so they are here and not there:
 *
 *   identity the site's own name, contact block, social links, hero and about
 *            copy, achievements and car
 *   drivers  the roster
 *   sponsors the partner board
 *   team     the co-admins for this site — grantable on its own, so somebody
 *            can run the roster without being able to edit the copy
 *
 * `page` and `chrome` used to be here as well: the section-built landing page
 * and its header and footer. Migration 0025 removed both — this site's pages
 * are hand-built components that read the tables above, so there was no page
 * for those grants to open. See the note at the top of that migration.
 *
 * `*` is not a module, it is "all of the above and any added later". A sport
 * admin holds one and does not have to be re-granted when a feature is
 * switched on.
 */
export const GRANT_MODULES = ["*", "identity", "drivers", "sponsors", "team", ...SITE_MODULES] as const;
export type GrantModule = (typeof GRANT_MODULES)[number];

export const GRANT_LABELS: Record<GrantModule, string> = {
  "*": "Everything on this sport",
  identity: "Team & site",
  drivers: "Drivers",
  sponsors: "Sponsors",
  team: "Co-admins",
  articles: "Articles",
  events: "Calendar",
  circuits: "Circuits",
};

/**
 * One grant.
 *
 * Carries the site's SLUG as well as its id, because two different questions
 * are asked of it and they want different keys: a route guard has a site id
 * from the database, and the media library has a folder name, which is a slug.
 * Looking the second one up would mean a query inside a predicate that the
 * browser also calls.
 */
export type Grant = {
  siteId: string;
  siteSlug: string;
  module: GrantModule;
};


/**
 * Everything the predicates need. `AdminSession` satisfies it.
 */
export type Scoped = {
  role: AdminRole;
  grants: Grant[];
};

/* ─────────────────────────────── The tests ──────────────────────────────── */

const grantsOn = (session: Scoped | null | undefined, match: (grant: Grant) => boolean): Grant[] =>
  session?.grants.filter(match) ?? [];

/** An owner passes everything; a member needs the module or a `*` on that site. */
function holds(
  session: Scoped | null | undefined,
  match: (grant: Grant) => boolean,
  module: GrantModule
): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  return session.grants.some(
    (grant) => match(grant) && (grant.module === "*" || grant.module === module)
  );
}

/** May this account edit one module of one site? The question every guard asks. */
export function canEdit(
  session: Scoped | null | undefined,
  siteId: string,
  module: GrantModule
): boolean {
  return holds(session, (grant) => grant.siteId === siteId, module);
}

/** The same, addressed by slug — what the media folder predicates have. */
export function canEditSlug(
  session: Scoped | null | undefined,
  siteSlug: string,
  module: GrantModule
): boolean {
  return holds(session, (grant) => grant.siteSlug === siteSlug, module);
}

/** Any reach at all into one site. What "may they see this sport?" means. */
export function canSeeSite(session: Scoped | null | undefined, siteId: string): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  return session.grants.some((grant) => grant.siteId === siteId);
}

/** The same, by slug. The outer door to a site's media folder. */
export function canSeeSiteSlug(session: Scoped | null | undefined, siteSlug: string): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  return session.grants.some((grant) => grant.siteSlug === siteSlug);
}

/** Any reach at all, into anything. The outer door to the console. */
export function canSeeAnySite(session: Scoped | null | undefined): boolean {
  if (!session) return false;
  return session.role === "owner" || session.grants.length > 0;
}

/**
 * A sport admin: `*` on this site.
 *
 * Distinct from `canEdit(session, site, "team")` because the two answer
 * different questions. A `team` grant lets somebody manage the roster; `*`
 * makes them the person the site belongs to, and only that person may grant
 * `team` in the first place.
 */
export function isSportAdmin(session: Scoped | null | undefined, siteId: string): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  return session.grants.some((grant) => grant.siteId === siteId && grant.module === "*");
}

/** May they change who else works on this site? */
export function canManageTeam(session: Scoped | null | undefined, siteId: string): boolean {
  return canEdit(session, siteId, "team");
}

/**
 * Which modules may this account grant to somebody else on this site?
 *
 * Never `*`, and never on a site they do not run. A sport admin can hand out
 * every piece of their own sport and cannot clone themselves — the only account
 * that can create another sport admin is the owner, which is what keeps "who
 * owns this sport" answerable.
 */
export function grantableModules(
  session: Scoped | null | undefined,
  siteId: string
): GrantModule[] {
  if (!canManageTeam(session, siteId)) return [];
  return GRANT_MODULES.filter((module) => module !== "*");
}

/** The site ids this account can reach. An owner's answer is "all", so: null. */
export function siteIdsFor(session: Scoped | null | undefined): string[] | null {
  if (!session) return [];
  if (session.role === "owner") return null;
  return [...new Set(session.grants.map((grant) => grant.siteId))];
}

/** The site slugs this account can reach, for the media library's root list. */
export function siteSlugsFor(session: Scoped | null | undefined): string[] {
  if (!session) return [];
  return [...new Set(grantsOn(session, () => true).map((grant) => grant.siteSlug))].sort();
}

/** Which of a site's modules this account may actually open. Drives the nav. */
export function modulesFor(
  session: Scoped | null | undefined,
  siteId: string,
  available: readonly GrantModule[] = GRANT_MODULES
): GrantModule[] {
  return available.filter((module) => module !== "*" && canEdit(session, siteId, module));
}




export function canManageAdmins(session: Scoped | null | undefined): boolean {
  return session?.role === "owner";
}


/* ───────────────────────────── Normalising ──────────────────────────────── */

/** An unknown or missing role reads as the least privileged one, never the most. */
export function normaliseRole(value: unknown): AdminRole {
  return oneOf(value, ADMIN_ROLES, "member");
}

export function normaliseGrantModule(value: unknown): GrantModule | null {
  return typeof value === "string" && (GRANT_MODULES as readonly string[]).includes(value)
    ? (value as GrantModule)
    : null;
}

/**
 * Grants as stored, made safe to interpret.
 *
 * Unknown modules are dropped rather than carried — a retired module stops
 * being an access grant the moment it stops being a module, with no migration.
 * A row missing either identifier is dropped whole: a grant that does not name
 * its site is not a narrower grant, it is an unanswerable one.
 */
export function normaliseGrants(value: unknown): Grant[] {
  if (!Array.isArray(value)) return [];

  const out: Grant[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const siteId = typeof row.siteId === "string" ? row.siteId : "";
    const siteSlug = typeof row.siteSlug === "string" ? row.siteSlug : "";
    const module = normaliseGrantModule(row.module);
    if (!siteId || !siteSlug || !module) continue;

    const key = `${siteId}:${module}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ siteId, siteSlug, module });
  }

  return out;
}


/** A module list from a form, in a fixed order and with the unknown dropped. */
export function normaliseGrantModules(value: unknown): GrantModule[] {
  if (!Array.isArray(value)) return [];
  const wanted = new Set(value.filter((entry): entry is string => typeof entry === "string"));
  return GRANT_MODULES.filter((module) => wanted.has(module));
}

/** A grant module that is also a site feature, for filtering against `site.modules`. */
export function isSiteModule(module: GrantModule): module is SiteModule {
  return (SITE_MODULES as readonly string[]).includes(module);
}
