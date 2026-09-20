import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { revalidateSponsorPages } from "@/lib/server/revalidateTeam";
import { createSponsor, listSponsors, reorderSponsors } from "@/lib/server/sponsorsRepo";
import { isTeamRowId } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole board, tier by tier. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "sponsors");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ sponsors: await listSponsors(guard.site.id) });
  } catch (error) {
    console.error("[admin/sponsors] GET", error);
    return NextResponse.json({ error: "Could not load the sponsors." }, { status: 500 });
  }
}

/** Adds one. A sponsor with no name is not a sponsor, so that is the only rule. */
export async function POST(request: Request) {
  const guard = await guardRequestSite(request, "sponsors");
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
    const sponsor = await createSponsor(guard.site.id, body);
    revalidateSponsorPages();
    return NextResponse.json({ sponsor });
  } catch (error) {
    console.error("[admin/sponsors] POST", error);
    return NextResponse.json({ error: "Could not save the sponsor." }, { status: 500 });
  }
}

/**
 * Sets the order of the whole board from an array of ids.
 *
 * The positions written are global to the list, while the ORDER BY compares
 * `tier` first — see the note on `updateSponsor`. That is deliberate and it
 * works because the rail hands the ids over in the order it draws them, which
 * is already tier by tier: numbering them 10, 20, 30… down that list keeps the
 * relative order inside every band.
 */
export async function PATCH(request: Request) {
  const guard = await guardRequestSite(request, "sponsors");
  if (guard.denied) return guard.denied;

  let ids: unknown;
  try {
    ids = (await request.json())?.ids;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || !ids.every(isTeamRowId)) {
    return NextResponse.json({ error: "Expected a list of sponsor ids." }, { status: 400 });
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "The same sponsor was listed twice." }, { status: 400 });
  }

  try {
    await reorderSponsors(ids);
    revalidateSponsorPages();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/sponsors] PATCH", error);
    return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
  }
}
