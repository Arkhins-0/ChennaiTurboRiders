import { NextResponse } from "next/server";
import { isEventId } from "@/lib/events";
import { guardRequestSite } from "@/lib/server/access";
import { createEvent, listEvents, reorderEvents } from "@/lib/server/eventsRepo";
import { revalidateEventPages } from "@/lib/server/revalidateEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The collection. Listing, adding and ordering one sport's season.
 *
 * ── Why the reorder is a PATCH here and not a route of its own ────────────
 *
 * `/api/admin/events/reorder` would be a static sibling of `[id]`, and a static
 * sibling does not reliably win the route match — the request lands in the
 * `[id]` handler with `id` set to the string "reorder". Decks, tracks and
 * articles all learned this; the README records it. Ordering is a property OF
 * the collection, so PATCH on the collection is also the more honest verb.
 *
 * ── One sport per request ─────────────────────────────────────────────────
 *
 * Unlike the articles routes, which serve a cross-sport screen and therefore
 * narrow by session, every one of these names its sport in the query string and
 * is guarded against it. An event belongs to a season and a season belongs to a
 * sport; there is no list that spans them.
 */

const DUPLICATE = "23505";

export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ events: await listEvents(guard.site.id) });
  } catch (error) {
    console.error("[admin/events] GET", error);
    return NextResponse.json({ error: "Could not load the season." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  /*
   * A name OR a number. An event headed only by its circuit is the ordinary
   * case — "Round 03 · Bren Raceway" is what the card prints — so requiring a
   * title would be requiring somebody to type the circuit's name a second time.
   * What cannot happen is a row with neither, which has nothing to be listed by
   * and no address to invent.
   */
  const record = (body ?? {}) as { title?: unknown; round?: unknown; venue?: unknown };
  const named = [record.title, record.round, record.venue].some(
    (value) => typeof value === "string" && value.trim()
  );
  if (!named) {
    return NextResponse.json(
      { error: "An event needs a name, a number or a venue." },
      { status: 400 }
    );
  }

  try {
    const notes: string[] = [];
    const event = await createEvent(guard.site.id, body, notes);
    revalidateEventPages(guard.site);
    return NextResponse.json({ event, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json({ error: "That address is already in use." }, { status: 409 });
    }

    console.error("[admin/events] POST", error);
    return NextResponse.json({ error: "Could not save the event." }, { status: 500 });
  }
}

/** `{ ids: string[] }` — the whole season, in the order it should run in. */
export async function PATCH(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || !ids.every(isEventId)) {
    return NextResponse.json({ error: "Expected a list of event ids." }, { status: 400 });
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "The same event was listed twice." }, { status: 400 });
  }

  try {
    /*
     * Every id has to belong to the sport this request named.
     *
     * The guard proves the account may order THIS sport's season; it says
     * nothing about whether the ids in the body are that sport's. Without this
     * an INCRC admin could renumber pickleball's calendar by posting ids they
     * were never shown.
     */
    const mine = new Set((await listEvents(guard.site.id)).map((event) => event.id));
    if (!ids.every((id) => mine.has(id))) {
      return NextResponse.json({ error: "Your account cannot edit that." }, { status: 403 });
    }

    await reorderEvents(ids);
    revalidateEventPages(guard.site);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/events] PATCH", error);
    return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
  }
}
