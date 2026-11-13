import { NextResponse } from "next/server";
import { folderForEntity } from "@/lib/mediaPaths";
import { guardRequestSite } from "@/lib/server/access";
import { deleteDriver, getDriver, updateDriver } from "@/lib/server/driversRepo";
import { deleteEntityFolder, moveEntityFolder } from "@/lib/server/entityMedia";
import { revalidateDriverPages } from "@/lib/server/revalidateTeam";
import { isTeamRowId } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * A driver's address is frozen once it is a real name: `DriverForm` has no
 * control for it, because ctr.slugs cannot hold a driver and so there is
 * nowhere to record the redirect a moved address would need. The one move is
 * the placeholder `new-driver` an unnamed "Add driver" mints, traded on the
 * first save under a real name — nobody was ever given that address — and the
 * media folder named after it moves with it (PUT, below).
 */

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTeamRowId(id)) {
    return NextResponse.json({ error: "No such driver." }, { status: 404 });
  }

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
    const before = await getDriver(id);
    let driver = await updateDriver(id, body);
    if (!before || !driver) {
      return NextResponse.json({ error: "No such driver." }, { status: 404 });
    }

    /*
     * A placeholder address (`new-driver`) is traded for a real one on the
     * first save under a name — see `updateDriver`. The pictures follow it, the
     * way a season's do. Never fatal: the row is already written.
     */
    if (before.slug !== driver.slug) {
      try {
        await moveEntityFolder(
          folderForEntity(guard.site.slug, "drivers", before.slug, id),
          folderForEntity(guard.site.slug, "drivers", driver.slug, id)
        );
        driver = (await getDriver(id)) ?? driver;
      } catch (error) {
        console.error("[admin/drivers] folder move", error);
      }
    }

    revalidateDriverPages();
    return NextResponse.json({ driver });
  } catch (error) {
    console.error("[admin/drivers] PUT", error);
    return NextResponse.json({ error: "Could not save the driver." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  const { id } = await params;
  if (!isTeamRowId(id)) {
    return NextResponse.json({ error: "No such driver." }, { status: 404 });
  }

  try {
    // Read before the delete, because after it there is no slug left to name
    // the folder with. The circuits route reads its `before` for the same
    // shape of reason.
    const before = await getDriver(id);

    const removed = await deleteDriver(id);
    if (!removed) {
      return NextResponse.json({ error: "No such driver." }, { status: 404 });
    }

    /*
     * After the row, never before. With the driver gone, anything the usage
     * scan still finds belongs to somebody else and is moved to the shared
     * uploads folder rather than deleted.
     */
    const notes: string[] = [];
    if (before) {
      try {
        const { deleted, rescued } = await deleteEntityFolder(
          folderForEntity(guard.site.slug, "drivers", before.slug, before.id)
        );

        if (rescued > 0) {
          notes.push(
            rescued === 1
              ? `One of their pictures is used elsewhere on the site and was moved to the shared uploads folder. ${deleted} were removed.`
              : `${rescued} of their pictures are used elsewhere on the site and were moved to the shared uploads folder. ${deleted} were removed.`
          );
        }
      } catch (error) {
        console.error("[admin/drivers] folder delete", error);
        notes.push("Their pictures could not be tidied up and are still in the media library.");
      }
    }

    revalidateDriverPages();
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[admin/drivers] DELETE", error);
    return NextResponse.json({ error: "Could not delete the driver." }, { status: 500 });
  }
}
