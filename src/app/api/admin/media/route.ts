import { NextResponse } from "next/server";
import {
  canBrowseFolder,
  canOverrideUsage,
  canWriteFolder,
  folderOfKey,
  isMediaKey,
} from "@/lib/mediaPaths";
import { guardAnySite } from "@/lib/server/access";
import { getSession } from "@/lib/server/auth";
import { isVideoUrl, posterKeyFor } from "@/lib/media";
import { findUsage } from "@/lib/server/mediaUsage";
import { deleteObjects, isS3Configured, listMedia } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** At most this many in one request. Delete them in batches beyond it. */
const MAX_KEYS = 200;

/**
 * Everything this account may see, newest first — the "Recent" view.
 *
 * The flat counterpart to `/browse`: no folders, no delimiter, every folder's
 * files mixed together in the order they were uploaded. It is where the legacy
 * flat objects live, and it is what stops them looking lost now that everything
 * new lands in a folder.
 *
 * ── The one thing that changed here, and why ──────────────────────────────
 *
 * The response SHAPE is untouched — `{ configured, media }`, exactly as before,
 * because that is the only contract `MediaPicker` has ever had. The CONTENTS are
 * now filtered by `canBrowseFolder`.
 *
 * That is not a refinement, it is a hole being closed. This route returned every
 * object in the bucket to any account holding any single page grant, which was
 * merely leaky while the library was read-only and became dangerous the moment a
 * delete button existed. Filtering an array already in memory costs nothing.
 *
 * The limit is applied AFTER the filter, or an account scoped to one page would
 * get whatever fraction of the newest two hundred objects happened to be theirs
 * — a "Recent" view that goes mysteriously empty the busier another page gets.
 */
export async function GET() {
  const denied = await guardAnySite();
  if (denied) return denied;

  if (!isS3Configured()) {
    return NextResponse.json({ configured: false, media: [] });
  }

  try {
    const session = await getSession();
    const media = (await listMedia(5000))
      .filter((object) => canBrowseFolder(session, folderOfKey(object.key)))
      .slice(0, 200);

    return NextResponse.json({ configured: true, media });
  } catch (error) {
    console.error("[admin/media]", error);
    return NextResponse.json({ error: "Could not list the media bucket." }, { status: 500 });
  }
}

/**
 * Removes files. Two locks and a confirmation stand in front of it.
 *
 *   1. `canWriteFolder` on every key — you may only delete out of a folder that
 *      belongs to a page you edit. All-or-nothing: one key you may not touch
 *      refuses the whole request, which is the posture the entries route already
 *      takes, because a request half-honoured is one nobody can reason about.
 *   2. `findUsage` — anything still referenced answers 409 with the references,
 *      and only a second request carrying `confirm: true` goes through.
 *   3. `canOverrideUsage` on that second request — a warning may only be
 *      confirmed past by somebody who administers every page that would break.
 *
 * The 409 is re-checked on confirm and can fire twice. `findUsage` is a snapshot
 * and not a lock — its own doc comment says so — so somebody can save a page in
 * the seconds between the dialog opening and the button being pressed. Answering
 * 409 again with the fresh references is the correct handling of that race.
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

  const keys = (body as { keys?: unknown })?.keys;
  const confirm = (body as { confirm?: unknown })?.confirm === true;

  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: "No files were named." }, { status: 400 });
  }

  if (keys.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `Delete at most ${MAX_KEYS} files at a time.` },
      { status: 400 }
    );
  }

  if (!keys.every(isMediaKey)) {
    return NextResponse.json({ error: "That is not a media file." }, { status: 400 });
  }

  const session = await getSession();
  if (!keys.every((key) => canWriteFolder(session, folderOfKey(key)))) {
    return NextResponse.json({ error: "Your account cannot edit that." }, { status: 403 });
  }

  let usage;
  try {
    usage = (await findUsage(keys)).filter((row) => row.refs.length > 0);
  } catch (error) {
    // Fail closed. An outage must never read as "no references found, deleting".
    console.error("[admin/media] DELETE usage", error);
    return NextResponse.json(
      { error: "Could not check whether these files are in use, so nothing was deleted." },
      { status: 503 }
    );
  }

  if (usage.length > 0) {
    const refs = usage.flatMap((row) => row.refs);

    if (!canOverrideUsage(session, refs)) {
      return NextResponse.json(
        {
          error:
            "These files are used on a page your account cannot edit, so they cannot be deleted here.",
          usage,
        },
        { status: 403 }
      );
    }

    if (!confirm) {
      return NextResponse.json(
        { error: "Some of these files are still in use.", usage },
        { status: 409 }
      );
    }
  }

  try {
    /*
     * A video's poster goes with it.
     *
     * The still captured at upload time sits beside the video under the same
     * stem, and nothing in the database points at it — `posterFor` derives the
     * address rather than storing it, which is what keeps a video one column
     * instead of two. So the usage scan can never find a reference to a poster,
     * and deleting a video without this would leave a JPEG nobody can see, in a
     * folder nobody would think to look in, for ever.
     *
     * Derived and appended rather than asked for by the browser: the caller
     * deleting a video should not have to know it has a companion. A poster that
     * was never captured is a key that is not there, and `deleteObjects` does
     * not mind.
     */
    const posters = keys.filter(isVideoUrl).map(posterKeyFor);

    await deleteObjects([...keys, ...posters]);
    return NextResponse.json({ ok: true, deleted: keys.length });
  } catch (error) {
    console.error("[admin/media] DELETE", error);
    return NextResponse.json({ error: "Could not delete those files." }, { status: 500 });
  }
}
