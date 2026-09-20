import { NextResponse } from "next/server";
import { folderForEntity } from "@/lib/mediaPaths";
import { guardRequestSite } from "@/lib/server/access";
import { deleteEntityFolder } from "@/lib/server/entityMedia";
import { revalidateSponsorPages } from "@/lib/server/revalidateTeam";
import { deleteSponsor, getSponsor, updateSponsor } from "@/lib/server/sponsorsRepo";
import { isTeamRowId } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * No folder MOVE here either, and for a slightly different reason than the
 * drivers route gives.
 *
 * A sponsor's slug is not an address at all — there is no /sponsors/<slug>
 * page, only the board — so it exists purely as the stable key its media folder
 * is named after. Nothing links to it, so nothing would break if it moved; it
 * is frozen because moving it would buy nothing and cost a round trip on every
 * save to compare two values that cannot differ.
 */

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "sponsors");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTeamRowId(id)) {
    return NextResponse.json({ error: "No such sponsor." }, { status: 404 });
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
    const sponsor = await updateSponsor(id, body);
    if (!sponsor) {
      return NextResponse.json({ error: "No such sponsor." }, { status: 404 });
    }

    revalidateSponsorPages();
    return NextResponse.json({ sponsor });
  } catch (error) {
    console.error("[admin/sponsors] PUT", error);
    return NextResponse.json({ error: "Could not save the sponsor." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "sponsors");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTeamRowId(id)) {
    return NextResponse.json({ error: "No such sponsor." }, { status: 404 });
  }

  try {
    // Read before the delete: afterwards there is no slug left to name the
    // folder with.
    const before = await getSponsor(id);

    const removed = await deleteSponsor(id);
    if (!removed) {
      return NextResponse.json({ error: "No such sponsor." }, { status: 404 });
    }

    const notes: string[] = [];
    if (before) {
      try {
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "sponsors", before.slug, before.id)
        );

        if (rescued > 0) {
          notes.push(
            rescued === 1
              ? `One of its logos is used elsewhere on the site and was moved to the shared uploads folder. ${deleted} were removed.`
              : `${rescued} of its logos are used elsewhere on the site and were moved to the shared uploads folder. ${deleted} were removed.`
          );
        }
      } catch (error) {
        console.error("[admin/sponsors] folder delete", error);
        notes.push("Its logos could not be tidied up and are still in the media library.");
      }
    }

    revalidateSponsorPages();
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/sponsors] DELETE", error);
    return NextResponse.json({ error: "Could not delete the sponsor." }, { status: 500 });
  }
}
