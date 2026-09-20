import "server-only";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { canBrowseFolder, canWriteFolder } from "@/lib/mediaPaths";
import {
  canEdit,
  canManageAdmins,
  canManageTeam,
  canSeeAnySite,
  canSeeSite,
  isSiteModule,
  type GrantModule,
  type Scoped,
} from "@/lib/roles";
import { getSession, type AdminSession } from "@/lib/server/auth";
import { getSiteBySlug } from "@/lib/server/sitesRepo";
import { hasModule, type Site } from "@/lib/sites";

/**
 * The question every admin route asks before it does anything.
 *
 * Each of these used to be two lines of "is anyone signed in", copied into
 * thirteen handlers. Now that being signed in is not the whole question, adding
 * the rest by hand thirteen times is how one route ends up asking something
 * subtly different from its neighbour — and a route that asks the wrong
 * question is a hole, not a bug.
 *
 * So they are here, one per kind of thing this admin owns, and a handler spends
 * two lines on the answer:
 *
 *     const denied = await guardSite(siteId, "articles");
 *     if (denied) return denied;
 *
 * `null` means allowed. A response means stop, and it is already the right one:
 * 401 when nobody is signed in — the browser has an expired cookie and should
 * be sent to sign in again — and 403 when someone is, because that is not a
 * login problem and telling them to sign in again would be a lie.
 *
 * ── What changed when sports became rows ──────────────────────────────────
 *
 * A guard takes a SITE as well as a module. `guardPage("incrc")` could be
 * written with the sport baked in because there was one; `guardSite(id,
 * "page")` cannot, and that is the point — a handler now has to say whose
 * decks it is about, and the compiler makes it.
 *
 * The bodies match the shape every other route in this project returns for a
 * failure: `{ error: string }`, in plain English.
 */

const NOT_SIGNED_IN = { error: "Not signed in." };
const NOT_ALLOWED = { error: "Your account cannot edit that." };
const NO_SUCH_SITE = { error: "No such sport." };
const NOT_ENABLED = { error: "That is switched off for this sport." };

async function guard(allowed: (session: AdminSession) => boolean) {
  const session = await getSession();
  if (!session) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });
  return allowed(session) ? null : NextResponse.json(NOT_ALLOWED, { status: 403 });
}

/**
 * One module of one site. The guard nearly every route wants.
 *
 * Two separate refusals, deliberately kept apart: an account that may not touch
 * this gets 403, and a module the SITE does not have gets 404-shaped 400 — the
 * second is not a permission problem, and reporting it as one would send an
 * owner hunting for a grant that would not have helped.
 */
export async function guardSite(
  siteId: string,
  module: GrantModule
): Promise<NextResponse | null> {
  return guard((session) => canEdit(session, siteId, module));
}

/**
 * The same, resolving the sport from its slug — what a `/api/admin/[sport]/…`
 * handler has in its params.
 *
 * Returns the site too, so the caller does not look it up a second time. A
 * missing sport is refused before the permission question is asked: "no such
 * sport" and "not yours" are different answers and an account that may see
 * neither should not be able to tell them apart from the outside — which is
 * why both return before anything reads the database further.
 */
export async function guardSiteSlug(
  slug: string,
  module: GrantModule
): Promise<{ denied: NextResponse } | { denied: null; site: Site }> {
  const session = await getSession();
  if (!session) return { denied: NextResponse.json(NOT_SIGNED_IN, { status: 401 }) };

  const site = await getSiteBySlug(slug);
  if (!site) return { denied: NextResponse.json(NO_SUCH_SITE, { status: 404 }) };

  if (!canEdit(session, site.id, module)) {
    return { denied: NextResponse.json(NOT_ALLOWED, { status: 403 }) };
  }

  // A grant to edit a module the site has switched off is not an error in the
  // grant — modules come and go — but it is not a door either.
  if (isSiteModule(module) && !hasModule(site, module)) {
    return { denied: NextResponse.json(NOT_ENABLED, { status: 400 }) };
  }

  return { denied: null, site };
}

/**
 * The sport a REQUEST names, and whether this account may act on it.
 *
 * The slug travels in the query string — `?site=incrc` — on every method,
 * including the ones with a body. A body field would work for POST and PATCH
 * and not for GET or DELETE, and one place to look beats two: a route that
 * reads the site from somewhere different from its neighbour is how one of them
 * ends up guarding a different sport from the one it writes to.
 *
 * It is also why this takes the whole `Request` rather than a slug — the
 * handler cannot forget to pass it, because there is nothing to pass.
 */
export async function guardRequestSite(
  request: Request,
  module: GrantModule
): Promise<{ denied: NextResponse } | { denied: null; site: Site }> {
  const slug = new URL(request.url).searchParams.get("site")?.trim() ?? "";

  if (!slug) {
    return {
      denied: NextResponse.json(
        { error: "No sport was named for this request." },
        { status: 400 }
      ),
    };
  }

  return guardSiteSlug(slug, module);
}


/**
 * Any reach at all, into anything. The outer door to the media library.
 *
 * This used to be `guardAnyPage`, and the argument for it is unchanged: the
 * library is cross-cutting, so the outer door is "do they administer anything?"
 * and `guardFolder` is the inner one that decides which shelves. What changed
 * is only what "anything" counts — a grant on a site rather than a page key.
 */
export function guardAnySite(): Promise<NextResponse | null> {
  return guard(canSeeAnySite);
}

/**
 * One folder. The check every media route makes after `guardAnySite`.
 *
 * `browse` is listing, `write` is uploading into, creating and deleting. They
 * differ in exactly one place — the legacy root, which anybody may read and
 * only an owner may change — and the reasoning for that is on `canWriteFolder`.
 *
 * A folder that does not parse is refused here rather than passed on as `""`,
 * which would silently widen the request to the whole library.
 */
export async function guardFolder(
  folder: string,
  need: "browse" | "write"
): Promise<NextResponse | null> {
  return guard((session) =>
    need === "write" ? canWriteFolder(session, folder) : canBrowseFolder(session, folder)
  );
}


/** The co-admins of one sport. A `*` holder on that site, or the owner. */
export function guardTeam(siteId: string): Promise<NextResponse | null> {
  return guard((session) => canManageTeam(session, siteId));
}


/** The accounts themselves. */
export function guardOwner(): Promise<NextResponse | null> {
  return guard(canManageAdmins);
}


/* ─────────────────────────── Screens ──────────────────────────── */

/**
 * The same questions, for a console SCREEN rather than a route handler.
 *
 * A screen cannot return a 403 — it has to render something — and what it
 * renders is `notFound()`. Not a redirect: the obvious redirect is to the
 * admin's root, and the root's job is to send an account to its first screen,
 * which for an account that has just been refused one is a bounce. A screen
 * that is not theirs simply is not there.
 *
 * The layout above these has already refused anyone with no session at all, so
 * reaching one of these signed out is not a case that exists — but they are
 * written to refuse it anyway, because a guard that trusts its caller is not a
 * guard.
 */
export async function requireSite(
  slug: string,
  module: GrantModule
): Promise<{ session: AdminSession; site: Site }> {
  const session = await getSession();
  if (!session) notFound();

  const site = await getSiteBySlug(slug);
  if (!site) notFound();
  if (!canEdit(session, site.id, module)) notFound();
  if (isSiteModule(module) && !hasModule(site, module)) notFound();

  return { session, site };
}

/** A sport's own console, whatever screen of it. Used by the sport's layout. */
export async function requireSiteAccess(
  slug: string
): Promise<{ session: AdminSession; site: Site }> {
  const session = await getSession();
  if (!session) notFound();

  const site = await getSiteBySlug(slug);
  if (!site) notFound();
  if (!canSeeSite(session, site.id)) notFound();

  return { session, site };
}

/**
 * The media library's screen. Any grant at all, like the routes it calls.
 *
 * Not a module of its own, deliberately: media is cross-cutting, and a module
 * would silently lock every existing scoped account out of the library until
 * somebody went and re-ticked a box for each of them. What narrows the screen
 * is the folder map, which is a better answer than a module would have been
 * because it also narrows what is inside.
 */
export async function requireAnySite(): Promise<AdminSession> {
  const session = await getSession();
  if (!session || !canSeeAnySite(session)) notFound();
  return session;
}

export async function requireTeam(slug: string): Promise<{ session: AdminSession; site: Site }> {
  const session = await getSession();
  if (!session) notFound();

  const site = await getSiteBySlug(slug);
  if (!site || !canManageTeam(session, site.id)) notFound();

  return { session, site };
}

export async function requireOwner(): Promise<AdminSession> {
  const session = await getSession();
  if (!session || !canManageAdmins(session)) notFound();
  return session;
}


/** Kept as a named export so nothing has to import `Scoped` from two places. */
export type { Scoped };
