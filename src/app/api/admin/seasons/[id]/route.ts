import { NextResponse } from "next/server";
import { folderForEntity } from "@/lib/mediaPaths";
import { isSeasonId } from "@/lib/seasons";
import { guardRequestSite } from "@/lib/server/access";
import { deleteEntityFolder, moveEntityFolder } from "@/lib/server/entityMedia";
import { listEventsOfSeason } from "@/lib/server/eventsRepo";
import {
  deleteSeason,
  getSeason,
  moveEventsToSeason,
  updateSeason,
} from "@/lib/server/seasonsRepo";
import { revalidateSeasonPages } from "@/lib/server/revalidateSeasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres' unique violation, and the code updateSeason throws for a held address. */
const DUPLICATE = "23505";

type Params = { params: Promise<{ id: string }> };

/**
 * One season.
 *
 * The shape every record route in this project has: guard the sport named in the
 * query string, then check the row belongs to it. That second check is not
 * redundant with the guard — the guard proves the account may edit THIS sport's
 * calendar, and says nothing about whether the id in the path is one of its
 * seasons.
 *
 * ── The delete is the one that needs care ─────────────────────────────────
 *
 * 0021 declares `events.season_id` ON DELETE CASCADE, so removing a season takes
 * its rounds with it — addresses, reports and all. That is the right shape for
 * the schema (a round with no season is not a state anything can render) and the
 * wrong thing to do without saying so, which is why this route counts the rounds
 * and refuses unless the caller has either moved them or said the number back.
 */
export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isSeasonId(id)) {
    return NextResponse.json({ error: "No such season." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let before: Awaited<ReturnType<typeof getSeason>>;
  try {
    before = await getSeason(id);
  } catch (error) {
    console.error("[admin/seasons] PUT read", error);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }

  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such season." }, { status: 404 });
  }

  try {
    const notes: string[] = [];
    const season = await updateSeason(id, body, notes);
    if (!season) {
      return NextResponse.json({ error: "No such season." }, { status: 404 });
    }

    /*
     * The cover follows the address, exactly as an event's pictures do. Never
     * fatal: the row is already written, and answering 500 here would tell the
     * writer their season was lost when it was not.
     */
    const from = folderForEntity(guard.site.slug, "seasons", before.slug, id);
    const to = folderForEntity(guard.site.slug, "seasons", season.slug, id);

    let moved = false;
    if (before.slug && from !== to) {
      try {
        await moveEntityFolder(from, to);
        moved = true;
      } catch (error) {
        console.error("[admin/seasons] folder move", error);
        notes.push(
          "The season's pictures could not be moved to the new address. They still work where they are."
        );
      }
    }

    // Read back after a move: `updateSeason` returned the cover the browser sent,
    // which names the old folder, and the move has since rewritten that row.
    const fresh = moved ? ((await getSeason(id)) ?? season) : season;

    revalidateSeasonPages(guard.site);
    return NextResponse.json({ season: fresh, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json(
        { error: (error as Error).message || "That address is already in use." },
        { status: 409 }
      );
    }

    console.error("[admin/seasons] PUT", error);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }
}

/**
 * Removes a season, and — because of the CASCADE — every round in it.
 *
 * Two ways to be allowed to:
 *
 *   `?moveTo=<id>`  the rounds are moved to another season of this sport first,
 *                   and only the season row is deleted. What somebody who has
 *                   filed a weekend under the wrong year actually wants.
 *   `?rounds=<n>`   the caller states how many rounds they expect to lose, and
 *                   it has to match. A confirmation that carries the number is
 *                   a confirmation that cannot be stale: a season that gained a
 *                   round in another tab since the dialog opened refuses rather
 *                   than silently taking one more than was agreed to.
 */
export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isSeasonId(id)) {
    return NextResponse.json({ error: "No such season." }, { status: 404 });
  }

  let before: Awaited<ReturnType<typeof getSeason>>;
  try {
    before = await getSeason(id);
  } catch (error) {
    console.error("[admin/seasons] DELETE read", error);
    return NextResponse.json({ error: "Could not delete the season." }, { status: 500 });
  }

  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such season." }, { status: 404 });
  }

  const url = new URL(request.url);
  const moveTo = url.searchParams.get("moveTo") ?? "";
  const claimed = url.searchParams.get("rounds");

  try {
    const notes: string[] = [];
    let rounds = (await listEventsOfSeason(id)).length;

    if (moveTo) {
      if (!isSeasonId(moveTo) || moveTo === id) {
        return NextResponse.json({ error: "No such season to move them to." }, { status: 400 });
      }

      /*
       * `moveEventsToSeason` checks the destination belongs to this sport
       * itself, and moves nothing when it does not — so a count of zero on a
       * season that HAD rounds is that refusal, not an empty season.
       */
      const movedCount = await moveEventsToSeason(guard.site.id, id, moveTo);
      if (rounds > 0 && movedCount === 0) {
        return NextResponse.json({ error: "No such season to move them to." }, { status: 400 });
      }

      if (movedCount > 0) {
        notes.push(
          movedCount === 1
            ? "Its one round was moved to the other season."
            : `Its ${movedCount} rounds were moved to the other season.`
        );
      }
      rounds = 0;
    }

    if (rounds > 0 && Number(claimed) !== rounds) {
      return NextResponse.json(
        {
          error:
            rounds === 1
              ? "This season still has a round in it. Move it first, or confirm the delete."
              : `This season still has ${rounds} rounds in it. Move them first, or confirm the delete.`,
          rounds,
        },
        { status: 409 }
      );
    }

    const removed = await deleteSeason(id);
    if (!removed) {
      return NextResponse.json({ error: "No such season." }, { status: 404 });
    }

    if (rounds > 0) {
      notes.push(
        rounds === 1
          ? "Its round was deleted with it, and its address no longer works."
          : `Its ${rounds} rounds were deleted with it, and their addresses no longer work.`
      );
    }

    /*
     * The folder goes with the season — AFTER the row, never before. That order
     * is what makes the usage scan inside mean what it says: every reference
     * still found is by definition a reference from somewhere else.
     *
     * Only the season's OWN folder. The rounds that went with it have folders of
     * their own, and unpicking them here would mean walking a list of rows that
     * no longer exists; the media library's unused-file view is where those are
     * cleared, which is the same answer `deleteSite` gives.
     */
    if (before.slug) {
      try {
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "seasons", before.slug, id)
        );

        if (rescued > 0) {
          notes.push(
            rescued === 1
              ? `One of its pictures is used elsewhere on the site and was moved to the shared uploads folder. ${deleted} were removed.`
              : `${rescued} of its pictures are used elsewhere on the site and were moved to the shared uploads folder. ${deleted} were removed.`
          );
        }
      } catch (error) {
        // Includes a usage scan that could not run. Deleting nothing is the
        // right answer to not knowing what is referenced.
        console.error("[admin/seasons] folder delete", error);
        notes.push("Its pictures could not be tidied up and are still in the media library.");
      }
    }

    revalidateSeasonPages(guard.site);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/seasons] DELETE", error);
    return NextResponse.json({ error: "Could not delete the season." }, { status: 500 });
  }
}
