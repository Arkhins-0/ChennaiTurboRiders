import "server-only";

import { revalidatePath } from "next/cache";
import { articleHref, articlesHref } from "@/lib/articles";
import { siteHref, type SiteRef } from "@/lib/sites";

/**
 * The pages that draw an article, cleared after one changes.
 *
 * The index has to gain a new article, and stop offering one unpublished or
 * renamed under its old title.
 *
 * The article itself is cached for a minute like the rest of the public site.
 * The OLD address is cleared as well as the new one, because after a rename the
 * stale copy sits under the address that is now a redirect — so anybody on the
 * old link would keep getting the pre-rename page instead of being sent on.
 *
 * Both are the SITE's paths. See the note in revalidateDecks.ts.
 */
export function revalidateArticlePages(site: SiteRef, slugs: readonly string[] = []): void {
  revalidatePath(siteHref(site) || "/"); // the latest-news band on the home page
  revalidatePath(articlesHref(site));
  revalidatePath("/sitemap.xml");

  for (const slug of new Set(slugs)) {
    if (slug) revalidatePath(articleHref(site, { slug }));
  }
}
