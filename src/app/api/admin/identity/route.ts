import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import {
  revalidateAchievementPages,
  revalidateCarPages,
  revalidateTeamPages,
} from "@/lib/server/revalidateTeam";
import { getCar, getTeam, listAchievements, saveAchievements, saveCar, saveTeam } from "@/lib/server/teamRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The site's own identity: the profile, the car and the achievements.
 *
 * ── Why one route and not three ───────────────────────────────────────────
 *
 * Because it is one screen and one Save button. The three are edited together —
 * the hero copy, the counters under it, the car panel below and the timeline on
 * /about are the same piece of work — and three routes would mean the browser
 * firing three requests whose partial failure leaves the screen showing a state
 * that is in none of them.
 *
 * They are still three writes underneath, each its own transaction. What this
 * route guarantees is the ORDER and the reporting, not atomicity across all
 * three: a profile that saved and a car that did not is reported as a failure
 * with the profile already written, which is recoverable by pressing Save
 * again. Making all three one transaction would mean one repo function taking
 * every field on the screen, which is the shape these were split up to avoid.
 */

/** Everything the screen draws. Its own page reads this server-side; this is for a refresh. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "identity");
  if (guard.denied) return guard.denied;

  try {
    const [team, car, achievements] = await Promise.all([
      getTeam(guard.site.id),
      getCar(guard.site.id),
      listAchievements(guard.site.id),
    ]);

    return NextResponse.json({ team, car, achievements });
  } catch (error) {
    console.error("[admin/identity] GET", error);
    return NextResponse.json({ error: "Could not load the site's details." }, { status: 500 });
  }
}

/**
 * Saves whichever of the three the body carries.
 *
 * A missing key is "not edited", not "cleared". That matters because the screen
 * sends all three today and something else may send one tomorrow — and the
 * alternative reading would mean a request that forgot `achievements` silently
 * deleted the timeline.
 */
export async function PUT(request: Request) {
  const guard = await guardRequestSite(request, "identity");
  if (guard.denied) return guard.denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const team = "team" in body ? await saveTeam(guard.site.id, body.team) : await getTeam(guard.site.id);
    const car = "car" in body ? await saveCar(guard.site.id, body.car) : await getCar(guard.site.id);
    const achievements =
      "achievements" in body
        ? await saveAchievements(guard.site.id, body.achievements)
        : await listAchievements(guard.site.id);

    /*
     * Cleared in the same order the site reads them, and the profile's clear is
     * the widest: it takes the whole `(site)` layout, because the navigation and
     * the footer are in it. The other two are a page each. See revalidateTeam.
     */
    if ("team" in body) revalidateTeamPages();
    if ("car" in body) revalidateCarPages();
    if ("achievements" in body) revalidateAchievementPages();

    return NextResponse.json({ team, car, achievements });
  } catch (error) {
    console.error("[admin/identity] PUT", error);
    return NextResponse.json({ error: "Could not save the site's details." }, { status: 500 });
  }
}
