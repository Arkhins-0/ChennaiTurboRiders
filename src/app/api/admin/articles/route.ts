import { NextResponse } from "next/server";
import { isArticleId } from "@/lib/articles";
import { guardAnySite, guardRequestSite } from "@/lib/server/access";
import { createArticle, listArticles, reorderArticles } from "@/lib/server/articlesRepo";
import { getSession } from "@/lib/server/auth";
import { listSites } from "@/lib/server/sitesRepo";
import { revalidateArticlePages } from "@/lib/server/revalidateArticles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The collection. Listing, adding and ordering.
 *
 * ── Why the reorder is a PATCH here and not a route of its own ────────────
 *
 * `/api/admin/articles/reorder` would be a static sibling of `[id]`, and a static
 * sibling does not reliably win the route match — the request lands in the `[id]`
 * handler with `id` set to the string "reorder". Decks and tracks both learned
 * this; the README records it. Ordering is a property OF the collection, so PATCH
 * on the collection is also the more honest verb.
 *
 * ── Who may do what ───────────────────────────────────────────────────────
 *
 * The list is narrowed in SQL to the sites this account holds a grant on, so a
 * co-admin's payload never contains an article they cannot open. Writing names
 * its sport in the query string and is guarded against that.
 *
 * That naming is the change phase 1 made here. It used to read the page out of
 * the BODY and guard against it, with a null reading as "every page" and
 * therefore as owner-only — a rule that existed because an article could belong
 * to no page. Every article belongs to exactly one site now, and a site is not
 * something a body gets to choose: `guardRequestSite` reads it from the query
 * string and refuses before the body is parsed at all.
 */

const DUPLICATE = "23505";

export async function GET(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  // Optional: the console's per-sport screen sends one, the cross-sport list
  // does not. `listArticles` narrows to the account's own grants either way.
  const wanted = new URL(request.url).searchParams.get("site")?.trim() ?? "";

  try {
    // Non-null: guardAnySite already refused a request with no session.
    const session = (await getSession())!;

    if (!wanted) {
      return NextResponse.json({ articles: await listArticles(session) });
    }

    const guard = await guardRequestSite(request, "articles");
    if (guard.denied) return guard.denied;

    return NextResponse.json({ articles: await listArticles(session, guard.site.id) });
  } catch (error) {
    console.error("[admin/articles] GET", error);
    return NextResponse.json({ error: "Could not load the articles." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await guardRequestSite(request, "articles");
  if (guard.denied) return guard.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = (body as { title?: unknown })?.title;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  try {
    const notes: string[] = [];
    const article = await createArticle(guard.site.id, body, notes);
    revalidateArticlePages(guard.site, [article.slug]);
    return NextResponse.json({ article, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json({ error: "That address is already in use." }, { status: 409 });
    }

    console.error("[admin/articles] POST", error);
    return NextResponse.json({ error: "Could not save the article." }, { status: 500 });
  }
}

/** `{ ids: string[] }` — the whole list, in the order it should be in. */
export async function PATCH(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || !ids.every(isArticleId)) {
    return NextResponse.json({ error: "Expected a list of article ids." }, { status: 400 });
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "The same article was listed twice." }, { status: 400 });
  }

  try {
    const session = (await getSession())!;

    /*
     * Every id has to be one this account may edit.
     *
     * Unlike the decks reorder, this list is not one sport's worth of rows —
     * the screen shows whichever sports the account holds, and the request is a
     * bare list of ids with no site on it. Without this an INCRC co-admin could
     * reorder every sport's articles by posting ids they were never shown.
     */
    const reachable = await listArticles(session);
    const mine = new Map(reachable.map((article) => [article.id, article.site_id]));
    if (!ids.every((id) => mine.has(id))) {
      return NextResponse.json({ error: "Your account cannot edit that." }, { status: 403 });
    }

    await reorderArticles(ids);

    /*
     * Every sport whose index this touched, not one.
     *
     * The order is what the index is sorted by, and this request can span
     * sports — it is the cross-sport screen's reorder, which is also why it has
     * no `?site=` to guard against. Clearing one site's index would leave the
     * others serving yesterday's order with nothing to say why.
     */
    const touched = new Set(ids.map((id) => mine.get(id)));
    const sites = (await listSites()).filter((site) => touched.has(site.id));
    for (const site of sites) revalidateArticlePages(site);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/articles] PATCH", error);
    return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
  }
}
