import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { createSeason, listSeasons } from "@/lib/server/seasonsRepo";
import { revalidateSeasonPages } from "@/lib/server/revalidateSeasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The collection. Listing and adding one sport's seasons.
 *
 * Guarded on `events`, not on a module of its own. A season and its rounds are
 * one job — whoever may announce a weekend may announce the year it runs in —
 * and a second grant would mean an account that can add rounds to a season it
 * cannot create, which is a state with nothing to recommend it.
 *
 * No PATCH. Every other ordered collection here has one because its screen has a
 * drag handle; a season's order is its year, it is a number on the form, and
 * `listSeasons` reads it descending. There is no list to drag.
 */

const DUPLICATE = "23505";

export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ seasons: await listSeasons(guard.site.id) });
  } catch (error) {
    console.error("[admin/seasons] GET", error);
    return NextResponse.json({ error: "Could not load the seasons." }, { status: 500 });
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
   * A name, and only a name.
   *
   * Unlike an event — which may be headed by its circuit and so accepts a number
   * or a venue instead — a season has nothing else to be listed by. "2026
   * Season" is the whole of what it is called.
   */
  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A season needs a name." }, { status: 400 });
  }

  try {
    const notes: string[] = [];
    const season = await createSeason(guard.site.id, body, notes);
    revalidateSeasonPages(guard.site);
    return NextResponse.json({ season, notes });
  } catch (error) {
    if ((error as { code?: string })?.code === DUPLICATE) {
      return NextResponse.json(
        { error: (error as Error).message || "That address is already in use." },
        { status: 409 }
      );
    }

    console.error("[admin/seasons] POST", error);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }
}
