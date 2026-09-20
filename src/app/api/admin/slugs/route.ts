import { NextResponse } from "next/server";
import { isArticleId } from "@/lib/articles";
import { isEventId } from "@/lib/events";
import { type GrantModule } from "@/lib/roles";
import { isUsableSlug, type SlugCheck, type SlugKind } from "@/lib/slug";
import { guardRequestSite } from "@/lib/server/access";
import type { SiteRef } from "@/lib/sites";
import * as articles from "@/lib/server/articlesRepo";
import * as events from "@/lib/server/eventsRepo";
import { revalidateArticlePages } from "@/lib/server/revalidateArticles";
import { revalidateEventPages } from "@/lib/server/revalidateEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who holds an address, and how to take one back.
 *
 * This exists because the answer was only ever available at the moment of
 * saving. An admin typed an address, pressed Save, and found out from a 409
 * that it belonged to something else — by which point the rest of their edits
 * were sitting unsaved behind the refusal. Asked while they type, the same fact
 * is a sentence under the box.
 *
 * It is one route for every kind rather than one each, because the question and
 * the answer are identical and only the table differs. What does NOT collapse
 * is the guard: the kind decides which module is required, so a deck editor
 * cannot use this to enumerate the registration forms.
 *
 * Each kind is checked SEPARATELY and never against another. They publish under
 * different prefixes — /register/, /deck/ and /articles/ — so `entry-pack` being
 * both a form and a deck is two different pages, not a collision.
 *
 * ── Every question is now about one sport ─────────────────────────────────
 *
 * `?site=<slug>` is required on both methods. An address is unique within a
 * site since migration 0014, so "is `opener` free?" has no answer without one —
 * it is free on pickleball and taken on INCRC, and both are correct.
 *
 * That also retires the `guardWrite` hook this route used to carry. It existed
 * because releasing an ARTICLE's address edited a record whose owner depended
 * on the page it was on, which `guard` could not know before reading the row.
 * An article belongs to a site, the site is in the query string, and the guard
 * knows it before anything is read — so the second guard has nothing left to
 * ask. `releaseFormerSlug` scopes its own `WHERE` by site as well, so a mistyped
 * id cannot reach across sports even if this handler were wrong.
 */

type Repo = {
  /** Which module of the named sport this kind belongs to. */
  module: GrantModule;
  findSlugOwner: (
    siteId: string,
    slug: string,
    exceptId?: string
  ) => Promise<Awaited<ReturnType<typeof articles.findSlugOwner>>>;
  releaseFormerSlug: (siteId: string, slug: string, fromId: string) => Promise<boolean>;
  isId: (value: unknown) => value is string;
  revalidate: (site: SiteRef, slug: string) => void;
};

const REPOS: Record<SlugKind, Repo> = {
  article: {
    module: "articles",
    findSlugOwner: articles.findSlugOwner,
    releaseFormerSlug: articles.releaseFormerSlug,
    isId: isArticleId,
    revalidate: (site, slug) => revalidateArticlePages(site, [slug]),
  },
  event: {
    module: "events",
    findSlugOwner: events.findSlugOwner,
    releaseFormerSlug: events.releaseFormerSlug,
    isId: isEventId,
    // Takes no slug: the events revalidator clears the detail route by its
    // PATTERN, which covers the address just released along with every other.
    revalidate: (site) => revalidateEventPages(site),
  },
};

function repoFor(value: unknown): Repo | null {
  return value === "article" || value === "event"
    ? REPOS[value]
    : null;
}

/** `?site=incrc&kind=form&slug=2026-entry&exceptId=<uuid>` — is this address free? */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = repoFor(url.searchParams.get("kind"));
  if (!repo) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  const guard = await guardRequestSite(request, repo.module);
  if (guard.denied) return guard.denied;

  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();

  // The thing being edited holds its own address, and telling somebody their
  // own slug is taken is the fastest way to make a warning ignored.
  const exceptId = url.searchParams.get("exceptId") ?? "";
  if (exceptId && !repo.isId(exceptId)) {
    return NextResponse.json({ error: "Not an id." }, { status: 400 });
  }

  if (!isUsableSlug(slug)) {
    return NextResponse.json({ status: "invalid" } satisfies SlugCheck);
  }

  try {
    const holder = await repo.findSlugOwner(guard.site.id, slug, exceptId);
    return NextResponse.json(
      (holder ? { status: "taken", holder } : { status: "free" }) satisfies SlugCheck
    );
  } catch (error) {
    console.error("[admin/slugs] GET", error);
    return NextResponse.json({ error: "Could not check that address." }, { status: 500 });
  }
}

/**
 * Hands a FORMER address back, so something else may take it.
 *
 * `?site=<slug>` plus `{ kind, slug, fromId }`. The row named by `fromId` stops
 * answering to it, and whoever asked is then free to save it as their own — a
 * second step, on purpose, because a save that quietly rewrote another record's
 * redirects on the way past would be the same silent theft this whole change
 * exists to stop.
 *
 * A CURRENT address cannot be released. The repo enforces that in its `WHERE`
 * rather than trusting this handler to have checked, and the check here is only
 * so the refusal says something useful.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { kind, slug, fromId } = (body ?? {}) as {
    kind?: unknown;
    slug?: unknown;
    fromId?: unknown;
  };

  const repo = repoFor(kind);
  if (!repo) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  const guard = await guardRequestSite(request, repo.module);
  if (guard.denied) return guard.denied;

  const address = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!isUsableSlug(address) || !repo.isId(fromId)) {
    return NextResponse.json({ error: "Expected an address and an id." }, { status: 400 });
  }

  try {
    const holder = await repo.findSlugOwner(guard.site.id, address);

    if (holder?.held === "current") {
      return NextResponse.json(
        { error: `That is where “${holder.name}” lives now, not an old address of it.` },
        { status: 409 }
      );
    }

    const released = await repo.releaseFormerSlug(guard.site.id, address, fromId);
    if (!released) {
      // Somebody else got there first, or it was already retired. Either way the
      // address is free, which is what the caller wanted.
      return NextResponse.json({ ok: true, released: false });
    }

    repo.revalidate(guard.site, address);
    return NextResponse.json({ ok: true, released: true });
  } catch (error) {
    console.error("[admin/slugs] POST", error);
    return NextResponse.json({ error: "Could not free that address." }, { status: 500 });
  }
}
