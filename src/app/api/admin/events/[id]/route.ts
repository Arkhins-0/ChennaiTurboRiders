import { NextResponse } from "next/server";
import { isEventId } from "@/lib/events";
import { folderForEntity } from "@/lib/mediaPaths";
import { guardRequestSite } from "@/lib/server/access";
import { deleteEntityFolder, moveEntityFolder } from "@/lib/server/entityMedia";
import { deleteEvent, getEvent, updateEvent } from "@/lib/server/eventsRepo";
import { revalidateEventPages } from "@/lib/server/revalidateEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres' unique violation, and the code updateEvent throws for a held address. */
const DUPLICATE = "23505";

type Params = { params: Promise<{ id: string }> };

/**
 * One event.
 *
 * The shape every record route in this project has: guard the sport named in
 * the query string, then check the row belongs to it. That second check is not
 * redundant with the guard — the guard proves the account may edit THIS sport's
 * season, and says nothing about whether the id in the path is one of its
 * events. Without it an INCRC co-admin could edit a pickleball event by naming
 * their own sport in the query string.
 *
 * An event of another sport is not "forbidden", it is not there. Saying so is
 * also what stops the id space being probed from a sport somebody does happen
 * to administer.
 */
export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isEventId(id)) {
    return NextResponse.json({ error: "No such event." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let before: Awaited<ReturnType<typeof getEvent>>;
  try {
    before = await getEvent(id);
  } catch (error) {
    console.error("[admin/events] PUT read", error);
    return NextResponse.json({ error: "Could not save the event." }, { status: 500 });
  }

  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such event." }, { status: 404 });
  }

  try {
    const notes: string[] = [];
    const event = await updateEvent(id, body, notes);
    if (!event) {
      return NextResponse.json({ error: "No such event." }, { status: 404 });
    }

    /*
     * The pictures follow the address.
     *
     * An event's folder is named after its sport and its address —
     * `incrc/events/round-01` — and only the second half can change, because a
     * site is set at create and never moved.
     *
     * Never fatal. The row is already written; answering 500 here would tell the
     * writer their event was lost when it was not.
     */
    const from = folderForEntity(guard.site.slug, "events", before.slug, id);
    const to = folderForEntity(guard.site.slug, "events", event.slug, id);

    let moved = false;
    if (before.slug && from !== to) {
      try {
        await moveEntityFolder(from, to);
        moved = true;
      } catch (error) {
        console.error("[admin/events] folder move", error);
        notes.push(
          "The event's pictures could not be moved to the new address. They still work where they are."
        );
      }
    }

    /*
     * Read back after a move, and ONLY after a move.
     *
     * `updateEvent` writes the body the browser sent, whose inline images still
     * name the OLD folder, and the move then rewrites those same rows. Returning
     * the event as `updateEvent` built it would hand the editor addresses that
     * no longer exist — and because the editor keeps that copy as `saved`, the
     * very next save would write them back over the rewritten ones and undo the
     * move. The articles route learned this first.
     */
    const fresh = moved ? ((await getEvent(id)) ?? event) : event;

    revalidateEventPages(guard.site);
    return NextResponse.json({ event: fresh, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json(
        { error: "That address still belongs to another event." },
        { status: 409 }
      );
    }

    console.error("[admin/events] PUT", error);
    return NextResponse.json({ error: "Could not save the event." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isEventId(id)) {
    return NextResponse.json({ error: "No such event." }, { status: 404 });
  }

  let before: Awaited<ReturnType<typeof getEvent>>;
  try {
    before = await getEvent(id);
  } catch (error) {
    console.error("[admin/events] DELETE read", error);
    return NextResponse.json({ error: "Could not delete the event." }, { status: 500 });
  }

  if (!before || before.site_id !== guard.site.id) {
    return NextResponse.json({ error: "No such event." }, { status: 404 });
  }

  try {
    const removed = await deleteEvent(id);
    if (!removed) {
      return NextResponse.json({ error: "No such event." }, { status: 404 });
    }

    /*
     * The folder goes with the event — AFTER the row, never before.
     *
     * That order is what makes the usage scan inside mean what it says: with the
     * event already deleted, every reference still found is by definition a
     * reference from somewhere else, and those files are moved to the shared
     * folder rather than removed.
     */
    const notes: string[] = [];
    if (before.slug) {
      try {
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "events", before.slug, id)
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
        console.error("[admin/events] folder delete", error);
        notes.push("Its pictures could not be tidied up and are still in the media library.");
      }
    }

    revalidateEventPages(guard.site);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/events] DELETE", error);
    return NextResponse.json({ error: "Could not delete the event." }, { status: 500 });
  }
}
