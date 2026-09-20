import "server-only";

import { revalidateEventPages } from "@/lib/server/revalidateEvents";
import { type SiteRef } from "@/lib/sites";

/**
 * Every cached page a season appears on — which is every page a round appears
 * on, so this delegates rather than repeating the list.
 *
 * A season IS its rounds as far as the pages go: the home band draws one, and
 * `/<sport>/calendar` redirects to whichever is running. The season's own page
 * shares the `/[sport]/calendar/[slug]` route with the rounds, so the pattern
 * that clears one clears the other.
 *
 * Written as a call and not a copy for the usual reason: if it were a copy, the
 * day somebody adds a page an event appears on would be the day this one quietly
 * stopped clearing it.
 */
export function revalidateSeasonPages(site: SiteRef): void {
  revalidateEventPages(site);
}
