import { NextResponse } from "next/server";
import { canBrowseFolder, canWriteFolder, parseFolder, visibleRoots } from "@/lib/mediaPaths";
import { guardAnySite, guardFolder } from "@/lib/server/access";
import { getSession } from "@/lib/server/auth";
import { isS3Configured, listFolder } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One level of the media tree — the folders directly inside, and the files.
 *
 * What the explorer navigates with, and what the picker browses. `listFolder`
 * has done the work since the folder helpers were written; this is the first
 * thing to call it.
 *
 * ── What an account is allowed to see ─────────────────────────────────────
 *
 * At the ROOT, the folder list is the roots this account may browse, not every
 * root that exists. An INCRC editor does not see that `pickle/` is there, which
 * is the difference between a locked door and a door that is not drawn — and the
 * second is the better answer, because the first invites the handle to be tried.
 *
 * Below the root, `guardFolder` refuses outright with a 403. Both halves are
 * needed: hiding a folder from the listing is not protection, since the folder
 * is a query parameter anybody can type.
 *
 * The ROOT'S OWN FILES are always listed. That is where every upload made before
 * folders existed still sits, unattributed and un-attributable, and it is
 * currently every image on the site — hiding it would leave a scoped editor with
 * nothing to choose from. `canWriteFolder` is what stops them deleting one.
 *
 * ── Two conventions borrowed from the route beside this one ───────────────
 *
 * An unconfigured bucket is a 200 with `configured: false`, not an error: it was
 * never set up, and the picker uses that to explain itself. And a folder that
 * does not exist lists as empty rather than 404-ing — a breadcrumb that fails on
 * a folder somebody else has just deleted is worse than one showing nothing.
 */
export async function GET(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  const asked = new URL(request.url).searchParams.get("folder") ?? "";
  const folder = parseFolder(asked);

  if (folder === null) {
    return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
  }

  const refused = await guardFolder(folder, "browse");
  if (refused) return refused;

  if (!isS3Configured()) {
    return NextResponse.json({
      configured: false,
      folder,
      folders: [],
      files: [],
      truncated: false,
      canWrite: false,
    });
  }

  try {
    const session = await getSession();
    const listing = await listFolder(folder);

    /*
     * Drawn from what the server says, never re-derived in the browser. The
     * same predicate decides both, so the UI cannot show a delete button for
     * something the route would then refuse — one answer, two uses.
     */
    const folders = listing.folders.filter((entry) => canBrowseFolder(session, entry.path));

    return NextResponse.json({
      configured: true,
      ...listing,
      folders,
      canWrite: canWriteFolder(session, folder),
      // So the explorer can draw the rail without a second request.
      roots: folder === "" ? visibleRoots(session) : undefined,
    });
  } catch (error) {
    console.error("[admin/media] browse", error);
    return NextResponse.json({ error: "Could not list the media bucket." }, { status: 500 });
  }
}
