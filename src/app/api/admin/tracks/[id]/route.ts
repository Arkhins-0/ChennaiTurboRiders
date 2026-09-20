import { NextResponse } from "next/server";
import { folderForEntity } from "@/lib/mediaPaths";
import { guardRequestSite } from "@/lib/server/access";
import { deleteEntityFolder } from "@/lib/server/entityMedia";
import { revalidateTrackPages } from "@/lib/server/revalidateTracks";
import { deleteTrack, getTrack, updateTrack } from "@/lib/server/tracksRepo";
import { isTrackId, trackSlug } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * There is no folder MOVE on this route, and its absence is deliberate.
 *
 * A circuit's address is minted once by `freeSlug` in `createTrack` and frozen
 * — `updateTrack` omits `slug` from its UPDATE, and `TrackForm` has no control
 * for it, because `ctr.slugs` cannot hold a circuit and so there is nowhere to
 * record the redirect a moved address would need. A circuit's folder is named
 * after that slug, so it cannot move either.
 *
 * The machinery is there the day that changes: `moveEntityFolder` is generic,
 * and wiring it here is a `getTrack` before the update and the same three lines
 * the decks route uses. Adding them NOW would mean a round trip on every circuit
 * save to compare two values that cannot differ.
 */

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "circuits");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTrackId(id)) {
    return NextResponse.json({ error: "No such circuit." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  try {
    const track = await updateTrack(id, body);
    if (!track) {
      return NextResponse.json({ error: "No such circuit." }, { status: 404 });
    }

    revalidateTrackPages(guard.site);
    return NextResponse.json({ track });
  } catch (error) {
    console.error("[admin/tracks] PUT", error);
    return NextResponse.json({ error: "Could not save the circuit." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "circuits");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTrackId(id)) {
    return NextResponse.json({ error: "No such circuit." }, { status: 404 });
  }

  try {
    // Read before the delete, because after it there is no slug left to name the
    // folder with. The decks route reads its `before` for the same shape of
    // reason, one step earlier.
    const before = await getTrack(id);

    const removed = await deleteTrack(id);
    if (!removed) {
      return NextResponse.json({ error: "No such circuit." }, { status: 404 });
    }

    /*
     * After the row, never before — see the note in the decks route. With the
     * circuit gone, anything the scan still finds belongs to somebody else and
     * is moved to the shared folder rather than deleted.
     */
    const notes: string[] = [];
    if (before) {
      try {
        // `trackSlug` rather than `before.slug`: the stored column is what it
        // returns wherever there is one, and it is the accessor the rest of the
        // project addresses a circuit through. `Track` does not declare `slug`.
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "circuits", trackSlug(before), id)
        );

        if (rescued > 0) {
          notes.push(
            rescued === 1
              ? `One of its pictures is used elsewhere on the site and was moved to the shared uploads folder. ${deleted} were removed.`
              : `${rescued} of its pictures are used elsewhere on the site and were moved to the shared uploads folder. ${deleted} were removed.`
          );
        }
      } catch (error) {
        console.error("[admin/tracks] folder delete", error);
        notes.push("Its pictures could not be tidied up and are still in the media library.");
      }
    }

    revalidateTrackPages(guard.site);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/tracks] DELETE", error);
    return NextResponse.json({ error: "Could not delete the circuit." }, { status: 500 });
  }
}
