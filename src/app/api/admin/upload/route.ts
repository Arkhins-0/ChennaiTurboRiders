import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DEFAULT_UPLOAD_FOLDER,
  MEDIA_PREFIX,
  parseFolder,
  slugifyFileName,
} from "@/lib/mediaPaths";
import { UNSUPPORTED_TYPE, UPLOAD_TYPES, maxBytesFor, megabytes } from "@/lib/media";
import { guardAnySite, guardFolder } from "@/lib/server/access";
import { isS3Configured, uploadObject } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Takes one picture and puts it in the bucket, in the folder the screen asked for.
 *
 * The browser has already converted it to WebP and capped its longest edge
 * (see src/lib/client/toWebp.ts), so anything arriving here is small. The size
 * ceiling below is a backstop against a caller that skipped that step, not the
 * expected path.
 *
 * ── Pictures only, in practice ────────────────────────────────────────────
 *
 * The type table is shared with `/api/admin/upload/sign` and admits video, but
 * nothing sends one here: this route reads the whole file into a serverless
 * function as form data, and the platform refuses a request body over about
 * four and a half megabytes. A video goes straight to S3 by a signed PUT
 * instead. The table is shared rather than split so the two routes cannot
 * quietly come to admit different things — and a small video posted here still
 * works, which is the honest behaviour for a limit that is about transport
 * rather than about what a file is.
 *
 * ── The folder ────────────────────────────────────────────────────────────
 *
 * `folder` is a second form field, and a request without one still works — it
 * lands in the shared folder rather than failing, so a caller that never learns
 * about folders is degraded rather than broken. What it is NOT allowed to do is
 * name a folder belonging to a page this account cannot edit; `guardFolder`
 * answers that, and it is the only thing standing between a decks editor and
 * the landing page's pictures.
 */

export async function POST(request: Request) {
  const denied = await guardAnySite();
  if (denied) return denied;

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "Media storage is not configured. Paste a URL instead." },
      { status: 503 }
    );
  }

  let file: File | null = null;
  let asked: unknown = "";
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
    asked = form.get("folder") ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  // An absent folder is the shared one, not the root: the root is where every
  // upload made before folders existed sits, and nothing new should join them.
  const folder = parseFolder(asked === "" ? DEFAULT_UPLOAD_FOLDER : asked);
  if (folder === null) {
    return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
  }

  const refused = await guardFolder(folder, "write");
  if (refused) return refused;

  const extension = UPLOAD_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: UNSUPPORTED_TYPE }, { status: 415 });
  }

  const cap = maxBytesFor(file.type);
  if (file.size > cap) {
    return NextResponse.json(
      { error: `That file is larger than ${megabytes(cap)}.` },
      { status: 413 }
    );
  }

  try {
    /*
     * `<folder>/<readable-name>-<uuid>.<ext>`.
     *
     * A fresh uuid every time: objects are never overwritten, which is what
     * makes the immutable cache header on them honest, and what makes moving a
     * folder into one that already exists a merge rather than a collision.
     *
     * The name in front of it is the first caller `slugifyFileName` has ever
     * had, and it is what makes a folder of these readable rather than a wall
     * of uuids. It never decides the extension — that still comes from the MIME
     * type checked above, so a file called `x.png` that is really a PDF cannot
     * name itself a PNG.
     */
    const key = `${MEDIA_PREFIX}${folder}/${slugifyFileName(file.name)}-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadObject(key, buffer, file.type);

    // Additive. Every existing caller reads `url` and is unaffected.
    return NextResponse.json({ url, key, folder });
  } catch (error) {
    console.error("[admin/upload]", error);
    return NextResponse.json({ error: "Could not upload the file." }, { status: 500 });
  }
}
