import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DEFAULT_UPLOAD_FOLDER, MEDIA_PREFIX, parseFolder, slugifyFileName } from "@/lib/mediaPaths";
import {
  POSTER_EXTENSION,
  UNSUPPORTED_TYPE,
  UPLOAD_TYPES,
  isVideoType,
  maxBytesFor,
  megabytes,
  posterKeyFor,
} from "@/lib/media";
import { guardAnySite, guardFolder } from "@/lib/server/access";
import { isS3Configured, presignUpload, publicUrl } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signs a PUT so the browser can send a file straight to S3.
 *
 * ── Why videos cannot use the ordinary upload route ───────────────────────
 *
 * That route reads the whole file into a serverless function's memory as form
 * data. It is the right shape for a logo — the browser has already converted it
 * to WebP and capped it, so a few hundred kilobytes arrive — and it is not a
 * shape a video fits: the platform this deploys to refuses a request body over
 * about four and a half megabytes, which is smaller than any video worth
 * putting on a page. No amount of raising `MAX_BYTES` changes that, because the
 * limit is in front of the function.
 *
 * So the bytes never touch a server. This route decides WHERE the file may go
 * and WHAT it may be, and hands back a signature that is good for one key, one
 * content type and sixty seconds. `presignUpload` has been written and unused
 * since the media library was built; this is its first caller.
 *
 * ── What is still enforced, and what is not ───────────────────────────────
 *
 *   the folder     `guardFolder` — a decks co-admin cannot sign a key under
 *                  another sport's folder, which is the only thing standing
 *                  between them and its pictures.
 *   the type       the signature pins the content type, so the PUT that follows
 *                  cannot upload something else under a name this route chose.
 *   the extension  from the MIME type, never from the file's name.
 *   the size       DECLARED by the caller and checked here, and a presigned PUT
 *                  does not enforce it. An authenticated admin could send more
 *                  than they said. That is accepted — the caller is a trusted
 *                  admin, not the public — and `@aws-sdk/s3-presigned-post` has
 *                  a `content-length-range` condition if it ever stops being.
 *
 * ── The poster ────────────────────────────────────────────────────────────
 *
 * A video comes back with a SECOND signature, for a JPEG at the same key with
 * the extension swapped. That is where `posterFor` looks, so the pair has to be
 * minted together — the browser cannot invent the uuid and the route cannot
 * capture the frame. Uploading the poster is optional: a browser that could not
 * decode the video simply does not use the second signature, and the video
 * falls back to its first frame.
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

  let body: { folder?: unknown; name?: unknown; type?: unknown; size?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const extension = UPLOAD_TYPES[type];
  if (!extension) {
    return NextResponse.json({ error: UNSUPPORTED_TYPE }, { status: 415 });
  }

  const size = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : 0;
  const cap = maxBytesFor(type);
  if (size > cap) {
    return NextResponse.json(
      { error: `That file is larger than ${megabytes(cap)}.` },
      { status: 413 }
    );
  }

  // An absent folder is the shared one, not the root: the root is where every
  // upload made before folders existed sits, and nothing new should join them.
  const asked = typeof body.folder === "string" ? body.folder : "";
  const folder = parseFolder(asked === "" ? DEFAULT_UPLOAD_FOLDER : asked);
  if (folder === null) {
    return NextResponse.json({ error: "That is not a folder." }, { status: 400 });
  }

  const refused = await guardFolder(folder, "write");
  if (refused) return refused;

  try {
    const name = slugifyFileName(typeof body.name === "string" ? body.name : "");
    const key = `${MEDIA_PREFIX}${folder}/${name}-${randomUUID()}.${extension}`;
    const signed = await presignUpload(key, type);

    const poster = isVideoType(type)
      ? await (async () => {
          const posterKey = posterKeyFor(key);
          const signedPoster = await presignUpload(posterKey, "image/jpeg");
          return { key: posterKey, url: publicUrl(posterKey), ...signedPoster };
        })()
      : null;

    return NextResponse.json({
      key,
      url: publicUrl(key),
      uploadUrl: signed.uploadUrl,
      headers: signed.headers,
      folder,
      ...(poster ? { poster } : {}),
    });
  } catch (error) {
    console.error("[admin/upload/sign]", error);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }
}
