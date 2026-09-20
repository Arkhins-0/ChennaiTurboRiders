import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { revalidateTrackPages } from "@/lib/server/revalidateTracks";
import { createTrack, listTracks, reorderTracks } from "@/lib/server/tracksRepo";
import { isTrackId } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole list. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "circuits");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ tracks: await listTracks(guard.site.id) });
  } catch (error) {
    console.error("[admin/tracks] GET", error);
    return NextResponse.json({ error: "Could not load the circuits." }, { status: 500 });
  }
}

/** Adds one. A circuit with no name is not a circuit, so that is the only rule. */
export async function POST(request: Request) {
  const guard = await guardRequestSite(request, "circuits");
  if (guard.denied) return guard.denied;

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
    const track = await createTrack(guard.site.id, body);
    revalidateTrackPages(guard.site);
    return NextResponse.json({ track });
  } catch (error) {
    console.error("[admin/tracks] POST", error);
    return NextResponse.json({ error: "Could not save the circuit." }, { status: 500 });
  }
}

/**
 * Sets the order of the whole list from an array of ids.
 *
 * A method on the collection rather than a /tracks/reorder route, for the reason
 * the sports collection gives: a static sibling of [id] does not reliably win
 * the match, so the path would land in the [id] handler.
 */
export async function PATCH(request: Request) {
  const guard = await guardRequestSite(request, "circuits");
  if (guard.denied) return guard.denied;

  let ids: unknown;
  try {
    ids = (await request.json())?.ids;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || !ids.every(isTrackId)) {
    return NextResponse.json({ error: "Expected a list of circuit ids." }, { status: 400 });
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "The same circuit was listed twice." }, { status: 400 });
  }

  try {
    await reorderTracks(ids);
    revalidateTrackPages(guard.site);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/tracks] PATCH", error);
    return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
  }
}
