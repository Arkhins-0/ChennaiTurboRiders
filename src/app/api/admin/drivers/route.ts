import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { createDriver, listDrivers, reorderDrivers } from "@/lib/server/driversRepo";
import { revalidateDriverPages } from "@/lib/server/revalidateTeam";
import { isTeamRowId } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole roster. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ drivers: await listDrivers(guard.site.id) });
  } catch (error) {
    console.error("[admin/drivers] GET", error);
    return NextResponse.json({ error: "Could not load the drivers." }, { status: 500 });
  }
}

/**
 * Adds one.
 *
 * A surname is the only rule, and it is the rule rather than a first name
 * because the address is minted from the pair and the roster is sorted on the
 * last name. Somebody who goes by one name types it here.
 */
export async function POST(request: Request) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = (body ?? {}) as { firstName?: unknown; lastName?: unknown };
  const named =
    (typeof record.firstName === "string" && record.firstName.trim()) ||
    (typeof record.lastName === "string" && record.lastName.trim());

  if (!named) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  try {
    const driver = await createDriver(guard.site.id, body);
    revalidateDriverPages();
    return NextResponse.json({ driver });
  } catch (error) {
    console.error("[admin/drivers] POST", error);
    return NextResponse.json({ error: "Could not save the driver." }, { status: 500 });
  }
}

/**
 * Sets the order of the whole roster from an array of ids.
 *
 * A method on the collection rather than a /drivers/reorder route, for the
 * reason the circuits collection gives: a static sibling of [id] does not
 * reliably win the match, so the path would land in the [id] handler.
 */
export async function PATCH(request: Request) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  let ids: unknown;
  try {
    ids = (await request.json())?.ids;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || !ids.every(isTeamRowId)) {
    return NextResponse.json({ error: "Expected a list of driver ids." }, { status: 400 });
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "The same driver was listed twice." }, { status: 400 });
  }

  try {
    await reorderDrivers(ids);
    revalidateDriverPages();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/drivers] PATCH", error);
    return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
  }
}
