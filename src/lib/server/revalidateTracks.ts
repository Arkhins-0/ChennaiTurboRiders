import "server-only";

import { revalidatePath } from "next/cache";
import { siteHref, type SiteRef } from "@/lib/sites";
import { circuitsHref } from "@/lib/tracks";

/**
 * Every cached page a circuit appears on.
 *
 * Two, and both are the calendar: the band on the home page and /schedule
 * itself print the venue's name and location from ctr.tracks. There is no
 * circuit page of its own on this site — `circuitsHref` resolves to the
 * calendar for exactly that reason — so there is no route pattern to clear.
 */
export function revalidateTrackPages(site: SiteRef): void {
  revalidatePath(siteHref(site) || "/"); // the calendar draws circuits
  revalidatePath(circuitsHref(site));
  revalidatePath("/sitemap.xml");
}
