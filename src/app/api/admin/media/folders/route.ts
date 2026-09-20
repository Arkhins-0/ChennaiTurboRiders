import { NextResponse } from "next/server";
import {
  SEGMENT_MESSAGES,
  canOverrideUsage,
  joinFolder,
  parseFolder,
  segmentProblem,
} from "@/lib/mediaPaths";
import { guardAnySite, guardFolder } from "@/lib/server/access";
import { getSession } from "@/lib/server/auth";
import { findUsage } from "@/lib/server/mediaUsage";
import {
  createFolder,
  deleteObjects,
  folderExists,
  isS3Configured,
  listFolderDeep,
} from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Making and removing folders.
 *
 * Both halves check `guardFolder` against the PARENT for a create and against
 * the folder itself for a delete, so nobody makes a folder inside another page's
 * tree and nobody empties one.
 */

/**
 * A new, empty folder.
 *
 * The rejection is a sentence per rule rather than one "Invalid name." for six
 * of them — `segmentProblem` says which rule broke and `SEGMENT_MESSAGES` says
 * it in English. A single message for six rules is how somebody ends up typing
 * at a dialog until they give up.
 */
export async function POST(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  if (!isS3Configured()) {
    return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parent = parseFolder((body as { parent?: unknown })?.parent ?? "");
  if (parent === null) {
    return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  const problem = segmentProblem(name);
  if (problem) {
    return NextResponse.json({ error: SEGMENT_MESSAGES[problem] }, { status: 400 });
  }

  // Re-runs the depth check as well as the charset one, which is why the join
  // is asked for rather than assembled here.
  const folder = joinFolder(parent, name as string);
  if (folder === null) {
    return NextResponse.json({ error: "Folders can only go four deep." }, { status: 400 });
  }

  // Against the PARENT: creating inside a folder is writing to it.
  const refused = await guardFolder(parent, "write");
  if (refused) return refused;

  try {
    if (await folderExists(folder)) {
      return NextResponse.json({ error: "There is already a folder called that." }, { status: 409 });
    }

    await createFolder(folder);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error("[admin/media] folders POST", error);
    return NextResponse.json({ error: "Could not make that folder." }, { status: 500 });
  }
}

/**
 * A folder and everything under it.
 *
 * The irreversible one, so it is done alone — never mixed into a bulk selection
 * of files. "These four files and that folder with its two hundred children"
 * cannot be confirmed honestly in one sentence.
 *
 * Same three locks as deleting files: folder permission, the usage scan with its
 * 409, and `canOverrideUsage` on the confirm. The markers go with the files, or
 * the folder reappears empty.
 */
export async function DELETE(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  if (!isS3Configured()) {
    return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const folder = parseFolder((body as { folder?: unknown })?.folder);
  const confirm = (body as { confirm?: unknown })?.confirm === true;

  if (folder === null) {
    return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
  }

  if (folder === "") {
    return NextResponse.json(
      { error: "The media root is not a folder you can delete." },
      { status: 400 }
    );
  }

  const refused = await guardFolder(folder, "write");
  if (refused) return refused;

  try {
    const { files, markers, truncated } = await listFolderDeep(folder);

    if (truncated) {
      return NextResponse.json(
        { error: "That folder holds too many files to remove in one go. Empty it in batches." },
        { status: 400 }
      );
    }

    const keys = files.map((file) => file.key);

    if (keys.length > 0) {
      let usage;
      try {
        usage = (await findUsage(keys)).filter((row) => row.refs.length > 0);
      } catch (error) {
        // Fail closed, exactly as the file delete does.
        console.error("[admin/media] folders DELETE usage", error);
        return NextResponse.json(
          { error: "Could not check whether these files are in use, so nothing was deleted." },
          { status: 503 }
        );
      }

      if (usage.length > 0) {
        const session = await getSession();
        const refs = usage.flatMap((row) => row.refs);

        if (!canOverrideUsage(session, refs)) {
          return NextResponse.json(
            {
              error:
                "This folder holds files used on a page your account cannot edit, so it cannot be deleted here.",
              usage,
            },
            { status: 403 }
          );
        }

        if (!confirm) {
          return NextResponse.json(
            { error: "Some files in this folder are still in use.", usage },
            { status: 409 }
          );
        }
      }
    }

    // Markers included: without them the folder comes back, empty, and looks
    // like the delete silently failed.
    await deleteObjects([...keys, ...markers]);

    // Files only. That is what the user was told they were deleting; a marker is
    // plumbing they never saw.
    return NextResponse.json({ ok: true, deleted: keys.length });
  } catch (error) {
    console.error("[admin/media] folders DELETE", error);
    return NextResponse.json({ error: "Could not delete that folder." }, { status: 500 });
  }
}
