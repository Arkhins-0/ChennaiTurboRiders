import "server-only";

import { revalidatePath } from "next/cache";
import { calendarHref } from "@/lib/events";
import { siteHref, type SiteRef } from "@/lib/sites";

/**
 * Every cached page an event appears on.
 *
 * Four, and the first is the one an events screen would forget: the site's HOME
 * page carries the calendar band, and that band draws the season. Publishing an
 * event and finding the home page unchanged for a minute is the whole reason
 * these helpers are one function per record type rather than a `revalidatePath`
 * at each call site.
 *
 * The detail route is cleared by its route PATTERN rather than by one slug: a
 * rename changes the slug, so the page that has to be thrown away is the OLD
 * address, which the handler no longer has. `"page"` on the bracket path
 * invalidates every rendered slug of that route, which covers both.
 *
 * That pattern is the literal route file's path — `/[sport]/calendar/[slug]` for
 * a sport, `/calendar/[slug]` for the root — and NOT the site's own URL. A
 * pattern is matched against the route tree, so `/incrc/calendar/[slug]` would
 * match nothing and clear nothing. The lesson `revalidateTracks` records.
 */
export function revalidateEventPages(site: SiteRef): void {
  revalidatePath(siteHref(site) || "/"); // the calendar band draws the season
  revalidatePath(calendarHref(site));
  revalidatePath("/sitemap.xml");
}
