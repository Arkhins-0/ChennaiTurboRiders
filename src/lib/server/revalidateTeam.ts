import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Every cached page the team's own content appears on.
 *
 * The counterpart to `revalidateTrackPages`, and the reason it exists is the
 * same: the routes that read this content are cached, so something saved in the
 * console would otherwise sit invisible for up to the revalidate window on
 * pages the editor never thinks about. Listing them in one place is what stops
 * the next route that reads a driver being the one nobody remembers to clear.
 *
 * ── Why there is no site argument ─────────────────────────────────────────
 *
 * `revalidateTrackPages` takes a `SiteRef` and branches on `kind`, because a
 * circuit belongs to a sport and a sport's pages hang off `/incrc`. These
 * routes do not: the (site) route group is the bespoke design served at the
 * root and nowhere else — there is no `/[sport]/drivers`. A site argument would
 * be a parameter every caller had to supply and no branch ever read.
 *
 * The console can still only edit the site it has a grant on; what this says is
 * that only ONE site's content is ever rendered by these routes.
 */

/**
 * The identity: the name, the contact block, the social links, the hero and the
 * about copy.
 *
 * `"layout"` rather than a list of pages, and this is the one place in the
 * project that needs it. The navigation and the footer are in
 * src/app/(site)/layout.tsx and they read the profile, so every page under it
 * is stale when the profile changes — including the ones that read nothing else
 * from it. Enumerating them would be a list to keep in step with the route
 * folder, and the first page added after this would be missed.
 */
export function revalidateTeamPages(): void {
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}

/**
 * A driver saved, added, reordered or deleted.
 *
 * The detail route is cleared by its route PATTERN rather than by one slug, for
 * the reason the circuits note records: what has to be thrown away after a
 * delete is the OLD address, which the handler no longer has. `"page"` on the
 * bracket path invalidates every rendered slug of that route, which covers it.
 *
 * The home page is in the list because the driver reel is on it.
 */
export function revalidateDriverPages(): void {
  revalidatePath("/");
  revalidatePath("/drivers");
  revalidatePath("/drivers/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

/** A sponsor. The logo marquee is on the home page as well as /sponsors. */
export function revalidateSponsorPages(): void {
  revalidatePath("/");
  revalidatePath("/sponsors");
  revalidatePath("/sitemap.xml");
}

/** The car panel, which is on the home page and nowhere else. */
export function revalidateCarPages(): void {
  revalidatePath("/");
}

/** The achievements timeline, which is on /about and nowhere else. */
export function revalidateAchievementPages(): void {
  revalidatePath("/about");
}
