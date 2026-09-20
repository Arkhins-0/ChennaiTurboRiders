import { NextResponse } from "next/server";
import { isArticleId } from "@/lib/articles";
import { folderForEntity } from "@/lib/mediaPaths";
import { guardRequestSite } from "@/lib/server/access";
import { deleteArticle, getArticle, updateArticle } from "@/lib/server/articlesRepo";
import { deleteEntityFolder, moveEntityFolder } from "@/lib/server/entityMedia";
import { revalidateArticlePages } from "@/lib/server/revalidateArticles";
import { getSiteById } from "@/lib/server/sitesRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres' unique violation, and the code updateArticle throws for a held address. */
const DUPLICATE = "23505";

type Params = { params: Promise<{ id: string }> };

/**
 * ── One guard now, where there used to be two ─────────────────────────────
 *
 * These routes used to guard twice: an outer `guardAnyPage` before anything
 * happened, and an inner `guardArticle` once the row had been read and its page
 * was known — plus a THIRD check on save, because an article could be moved
 * between pages and both the old and the new one had to allow it.
 *
 * None of that is needed any more. The sport is named in the query string, so
 * it is known before the body is read, and it is not something an article can
 * be moved between: a site is set once, at create. So the shape is the same as
 * every other record route — guard the sport, then check the row belongs to it.
 *
 * That second check is not redundant with the guard. The guard proves the
 * account may edit THIS sport's articles; it says nothing about whether the id
 * in the path is one of them, and without the check an INCRC co-admin could
 * edit a pickleball article by naming their own sport in the query string.
 */
export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "articles");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isArticleId(id)) {
    return NextResponse.json({ error: "No such article." }, { status: 404 });
  }

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

  let before: Awaited<ReturnType<typeof getArticle>>;
  try {
    before = await getArticle(id);
  } catch (error) {
    console.error("[admin/articles] PUT read", error);
    return NextResponse.json({ error: "Could not save the article." }, { status: 500 });
  }

  // An article of another sport is not "forbidden", it is not there. Saying so
  // is also what stops the id space being probed from a sport somebody does
  // happen to administer.
  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such article." }, { status: 404 });
  }

  try {
    const notes: string[] = [];
    const article = await updateArticle(id, body, notes);
    if (!article) {
      return NextResponse.json({ error: "No such article." }, { status: 404 });
    }

    /*
     * The pictures follow the address.
     *
     * An article's folder is named after its sport and its address —
     * `incrc/articles/<slug>` — and only the second half can change, because a
     * site is set at create and never moved. So this is the same one-dimensional
     * rename decks does, and the old "it can also change page" case is gone.
     *
     * Never fatal. The row is already written; answering 500 here would tell the
     * writer their article was lost when it was not.
     */
    const from = folderForEntity(guard.site.slug, "articles", before.slug, id);
    const to = folderForEntity(guard.site.slug, "articles", article.slug, id);

    let moved = false;
    if (before.slug && from !== to) {
      try {
        await moveEntityFolder(from, to);
        moved = true;
      } catch (error) {
        console.error("[admin/articles] folder move", error);
        notes.push(
          "The article's pictures could not be moved to the new address. They still work where they are."
        );
      }
    }

    /*
     * Read back after a move, and ONLY after a move.
     *
     * `updateArticle` writes the body the browser sent, whose inline images still
     * name the OLD folder, and the move then rewrites those same rows. Returning
     * the article as `updateArticle` built it would hand the editor addresses that
     * no longer exist — and because the editor keeps that copy as `saved`, the
     * very next save would write them back over the rewritten ones and undo the
     * move.
     */
    const fresh = moved ? ((await getArticle(id)) ?? article) : article;

    revalidateArticlePages(guard.site, [fresh.slug, before.slug]);
    return NextResponse.json({ article: fresh, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json(
        { error: "That address still belongs to another article." },
        { status: 409 }
      );
    }

    console.error("[admin/articles] PUT", error);
    return NextResponse.json({ error: "Could not save the article." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "articles");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isArticleId(id)) {
    return NextResponse.json({ error: "No such article." }, { status: 404 });
  }

  let before: Awaited<ReturnType<typeof getArticle>>;
  try {
    before = await getArticle(id);
  } catch (error) {
    console.error("[admin/articles] DELETE read", error);
    return NextResponse.json({ error: "Could not delete the article." }, { status: 500 });
  }

  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such article." }, { status: 404 });
  }

  try {
    const removed = await deleteArticle(id);
    if (!removed) {
      return NextResponse.json({ error: "No such article." }, { status: 404 });
    }

    /*
     * The folder goes with the article — AFTER the row, never before.
     *
     * That order is what makes the usage scan inside mean what it says: with the
     * article already deleted, every reference still found is by definition a
     * reference from somewhere else, and those files are moved to the shared
     * folder rather than removed.
     */
    const notes: string[] = [];
    if (before.slug) {
      try {
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "articles", before.slug, id)
        );

        if (rescued > 0) {
          notes.push(
            rescued === 1
              ? `One of its pictures is used elsewhere on the site and was moved to the shared uploads folder. ${deleted} were removed.`
              : `${rescued} of its pictures are used elsewhere on the site and were moved to the shared uploads folder. ${deleted} were removed.`
          );
        }
      } catch (error) {
        // Includes a usage scan that could not run. Deleting nothing is the right
        // answer to not knowing what is referenced.
        console.error("[admin/articles] folder delete", error);
        notes.push("Its pictures could not be tidied up and are still in the media library.");
      }
    }

    revalidateArticlePages(guard.site, [before.slug, ...before.former_slugs]);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/articles] DELETE", error);
    return NextResponse.json({ error: "Could not delete the article." }, { status: 500 });
  }
}
