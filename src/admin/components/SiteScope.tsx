"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Site } from "@/lib/sites";

/**
 * Which sport the screen you are looking at belongs to.
 *
 * Every admin write now names its site — `?site=incrc` on the request — and the
 * places that need to say so are not the places that know it. `SlugField` is
 * four components below the editor and asks whether an address is free; the
 * editor itself is handed the site by its route. Threading a slug through every
 * intermediate prop would mean touching components that have no other reason to
 * change, and would be one forgotten prop away from a screen that silently asks
 * about the wrong sport.
 *
 * So it is a context, for the same reason and in the same shape as
 * `UploadFolder`: one value, set once per screen, read wherever it is needed.
 *
 * ── Why the whole site and not just the slug ──────────────────────────────
 *
 * The id is what a repo call wants, the slug is what a URL and a media folder
 * want, and `modules` is what decides whether a picker should offer anything at
 * all. All three come off one row, and a component that has to look one up from
 * another is a component that can be given a mismatched pair.
 */

const SiteContext = createContext<Site | null>(null);

export function SiteScope({ site, children }: { site: Site; children: ReactNode }) {
  // Memoised on the fields that are actually read, not on identity: a server
  // component hands down a fresh object every render, and without this every
  // consumer would re-render on every parent render.
  const value = useMemo(
    () => site,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site.id, site.slug, site.name, site.kind, site.status, site.accent, site.modules.join(",")]
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/**
 * The current sport.
 *
 * Throws when there is none, deliberately. Every screen that asks is inside a
 * `/site/[sport]/…` route whose layout provides one, so a missing value is a
 * screen mounted in the wrong place — and the alternative, returning null and
 * letting the caller send a request with no site on it, is a request the server
 * refuses with a message nobody can act on.
 */
export function useSite(): Site {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite() outside a <SiteScope>. This screen needs a sport.");
  return site;
}

/** The current sport, or null — for the few components shared with global screens. */
export function useSiteOrNull(): Site | null {
  return useContext(SiteContext);
}

/**
 * An admin API address with the sport on it.
 *
 * One place that knows the parameter is called `site` and holds a slug, so the
 * fourteen call sites cannot spell it differently from each other.
 */
export function withSite(path: string, site: { slug: string } | null): string {
  if (!site) return path;
  return `${path}${path.includes("?") ? "&" : "?"}site=${encodeURIComponent(site.slug)}`;
}
