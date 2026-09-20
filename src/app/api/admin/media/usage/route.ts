import { NextResponse } from "next/server";
import {
  canBrowseFolder,
  canOverrideUsage,
  folderOfKey,
  isMediaKey,
  parseFolder,
} from "@/lib/mediaPaths";
import { guardAnySite, guardFolder } from "@/lib/server/access";
import { getSession } from "@/lib/server/auth";
import { findUsage } from "@/lib/server/mediaUsage";
import { isS3Configured, listFolderDeep } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The same ceiling the delete route takes, for the same reason. */
const MAX_KEYS = 200;

/**
 * What points at these files, before anybody deletes them.
 *
 * POST rather than GET because a list of two hundred keys does not belong in a
 * URL. It exists so the confirm dialog can show the references BEFORE the user
 * commits, rather than firing a speculative delete to find out.
 *
 * Takes either `keys` or `folder`; a folder is expanded through `listFolderDeep`
 * so "delete this folder" can be confirmed as honestly as "delete these files".
 *
 * ── On telling somebody about a page they cannot edit ─────────────────────
 *
 * The answer names pages the caller may not administer, deliberately. "This is
 * used somewhere you cannot see" is unactionable; "this is used on the INCRC
 * page — newsroom" tells them who to go and ask. Nothing is disclosed beyond
 * "a picture appears on a page", and every one of those pages is on the open
 * internet. The route is still scoped: the caller must be able to BROWSE the
 * keys they ask about, so this cannot be used to enumerate another page's
 * folder.
 */
export async function POST(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const askedFolder = (body as { folder?: unknown })?.folder;
  const askedKeys = (body as { keys?: unknown })?.keys;

  let keys: string[];

  if (typeof askedFolder === "string") {
    const folder = parseFolder(askedFolder);
    if (folder === null) {
      return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
    }

    const refused = await guardFolder(folder, "browse");
    if (refused) return refused;

    if (!isS3Configured()) {
      return NextResponse.json({ usage: [], canOverride: true });
    }

    const { files, truncated } = await listFolderDeep(folder);
    if (truncated) {
      return NextResponse.json(
        { error: "That folder holds too many files to check in one go. Empty it in batches." },
        { status: 400 }
      );
    }

    keys = files.map((file) => file.key);
  } else if (Array.isArray(askedKeys)) {
    if (askedKeys.length > MAX_KEYS) {
      return NextResponse.json(
        { error: `Ask about at most ${MAX_KEYS} files at a time.` },
        { status: 400 }
      );
    }

    // Every key, or none. The same all-or-nothing posture the entries route
    // takes: a request half-honoured is one the caller cannot reason about.
    if (!askedKeys.every(isMediaKey)) {
      return NextResponse.json({ error: "That is not a media file." }, { status: 400 });
    }

    keys = askedKeys;

    const session = await getSession();
    const reachable = keys.every((key) => canBrowseFolder(session, folderOfKey(key)));
    if (!reachable) {
      return NextResponse.json({ error: "Your account cannot edit that." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Ask about some files or a folder." }, { status: 400 });
  }

  if (keys.length === 0) {
    return NextResponse.json({ usage: [], canOverride: true });
  }

  try {
    const usage = (await findUsage(keys)).filter((row) => row.refs.length > 0);
    const session = await getSession();

    return NextResponse.json({
      usage,
      // Whether the dialog may offer "Delete anyway" at all. Decided here, not
      // in the browser, and re-decided by the delete route on the way in.
      canOverride: canOverrideUsage(
        session,
        usage.flatMap((row) => row.refs)
      ),
    });
  } catch (error) {
    /*
     * Fail CLOSED, and say so rather than falling through to a 500.
     *
     * A database outage must never reach the dialog as "no references found",
     * because the dialog would then offer a one-click delete of files it has no
     * idea about. This is the one place a caught error must not be generic.
     */
    console.error("[admin/media] usage", error);
    return NextResponse.json(
      { error: "Could not check whether these files are in use, so nothing was deleted." },
      { status: 503 }
    );
  }
}
