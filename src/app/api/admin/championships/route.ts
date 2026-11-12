import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { createChampionship, listChampionships } from "@/lib/server/seasonsRepo";
import { revalidateSeasonPages } from "@/lib/server/revalidateSeasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The leagues the team races in. Edited from the season screen, so it sits
 * behind the same grant as the seasons themselves.
 */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  try {
    return NextResponse.json({ championships: await listChampionships(guard.site.id) });
  } catch (error) {
    console.error("[admin/championships] GET", error);
    return NextResponse.json({ error: "Could not load the leagues." }, { status: 500 });
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

  try {
    const championship = await createChampionship(guard.site.id, body);
    revalidateSeasonPages(guard.site);
    return NextResponse.json({ championship });
  } catch (error) {
    if ((error as { code?: string })?.code === "22023") {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    console.error("[admin/championships] POST", error);
    return NextResponse.json({ error: "Could not add the league." }, { status: 500 });
  }
}
