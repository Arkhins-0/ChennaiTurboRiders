/**
 * Whether an address points at a picture or at a video, and where its poster is.
 *
 * ── Why the extension and not a stored field ──────────────────────────────
 *
 * Every image in this project is stored as a URL in a text column — a banner's
 * `image`, a partner's `logo`, a section's `data`, an article's `cover_image`,
 * a node inside a rich-text body. Adding "and is it a video?" as a second field
 * would mean touching all of them: a migration, twenty-six section models, every
 * normaliser, every panel and every renderer, to record something the address
 * already says.
 *
 * So the address says it. `…/opener-a1b2c3d4.mp4` is a video and
 * `…/opener-a1b2c3d4.webp` is not, which is a fact about a key the upload route
 * already decides from the file's MIME type — a file called `x.png` that is
 * really a video cannot name itself a PNG, and the reverse holds too.
 *
 * The cost is honest and small: a pasted external address with no extension
 * (`https://cdn.example.com/watch?v=…`) reads as an image and renders as a
 * broken one. That was already true of a pasted address that is not a picture,
 * and the field's own preview shows it immediately.
 *
 * ── The poster ────────────────────────────────────────────────────────────
 *
 * A `<video>` with nothing to show renders a black rectangle until its first
 * frame arrives, which on a banner is the first thing a visitor sees. So the
 * browser captures a frame at upload time and stores it BESIDE the video under
 * the same stem — `opener-a1b2c3d4.mp4` and `opener-a1b2c3d4.jpg` — and
 * `posterFor` swaps the extension to find it.
 *
 * Derived rather than stored, for the reason above. If the capture failed, or
 * the address was pasted from somewhere else, the poster 404s and the browser
 * falls back to the first frame — which is exactly the behaviour of no poster at
 * all, arrived at without a second field to keep in step.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

/**
 * What a `<video>` in a browser can play, and nothing else.
 *
 * `mov` is here and is a container rather than a codec: a QuickTime file holding
 * H.264 plays in Safari and often in Chrome, and one holding ProRes plays
 * nowhere. It is accepted because it is what a phone produces and refusing it
 * outright would be refusing the commonest thing anybody will try; the field's
 * own preview is where a file that cannot play says so.
 */
export const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "ogg", "mov", "m4v"] as const;

/** The still captured from a video at upload time. One format, so it is derivable. */
export const POSTER_EXTENSION = "jpg";

/**
 * What may be uploaded, and the extension each type is stored as.
 *
 * The extension is decided HERE, from the MIME type, and never from the name the
 * file arrived with — a file called `x.png` that is really a video cannot name
 * itself a PNG, and `isVideoUrl` above trusts that. The upload routes share this
 * table so the direct-to-S3 path and the through-the-server path cannot admit
 * different things.
 */
export const UPLOAD_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",

  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
};

/**
 * How big each kind may be.
 *
 * An image arrives already converted to WebP and capped by the browser, so four
 * megabytes is a backstop against a caller that skipped that step rather than a
 * real ceiling. A video is not converted by anything — there is no ffmpeg in a
 * serverless bundle and no transcoding pipeline here — so what is uploaded is
 * what every visitor downloads, and the number is a bandwidth decision as much
 * as a storage one. 200 MB is roughly three minutes of good 1080p; a banner
 * loop that size would be a mistake, and the field says so.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** Whether a MIME type is one this project stores as a video. */
export function isVideoType(type: string): boolean {
  return type.startsWith("video/") && type in UPLOAD_TYPES;
}

/** The ceiling for a type, or 0 for one that may not be uploaded at all. */
export function maxBytesFor(type: string): number {
  if (!(type in UPLOAD_TYPES)) return 0;
  return isVideoType(type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

/** The sentence a route sends back for a type it will not take. */
export const UNSUPPORTED_TYPE =
  "Unsupported file type. Use WebP, PNG, JPEG or SVG for pictures, or MP4, WebM or MOV for video.";

/** `4 MB`, `200 MB` — for a message, not for arithmetic. */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * The extension of an address, lower case, without the dot.
 *
 * The query string and the fragment are cut off first: a signed URL carries
 * `?X-Amz-Signature=…` after the key, and reading backwards from the end of the
 * whole string would find the extension of nothing.
 */
export function extensionOf(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  const cut = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");

  if (cut < 0 || cut < slash) return "";
  return path.slice(cut + 1).toLowerCase();
}

/** Whether this address should be drawn as a video rather than a picture. */
export function isVideoUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(url));
}

/**
 * The still that sits beside a video, or "" for anything that is not one.
 *
 * Same address with the extension swapped. Not checked for existence — that is
 * the browser's job, and its answer to a missing poster is the right one.
 */
export function posterFor(url: string): string {
  if (!isVideoUrl(url)) return "";

  const [path, tail = ""] = splitQuery(url);
  const cut = path.lastIndexOf(".");
  return `${path.slice(0, cut + 1)}${POSTER_EXTENSION}${tail}`;
}

/** The poster's key for a video's key. What the upload route signs the pair with. */
export function posterKeyFor(key: string): string {
  const cut = key.lastIndexOf(".");
  return cut < 0 ? `${key}.${POSTER_EXTENSION}` : `${key.slice(0, cut + 1)}${POSTER_EXTENSION}`;
}

function splitQuery(url: string): [string, string] {
  const at = url.search(/[?#]/);
  return at < 0 ? [url, ""] : [url.slice(0, at), url.slice(at)];
}
