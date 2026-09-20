/**
 * Browser-side: turn whatever the admin picked into a small WebP before it ever
 * leaves the machine.
 *
 * Doing it here rather than on the server is what keeps the upload route
 * dependency-free — no sharp in the serverless bundle — and means the bytes
 * stored in S3 are already the bytes the landing page will serve.
 *
 * SVG is passed through untouched: it is already tiny and rasterising it would
 * be a downgrade. Anything that fails to decode is passed through too; the
 * route still enforces its own type and size limits.
 */

/** Crests are drawn at 256 CSS px at most, so 768 covers a 3x screen. */
const MAX_EDGE = 768;

/**
 * What a deck page is capped at instead.
 *
 * The default suits the things this was written for — a crest, a card
 * photograph, a banner — which are never drawn much wider than a third of the
 * screen. A deck page is the opposite: it is a scanned document read at close
 * to 900 CSS px, and 768 across arrives visibly soft. 1600 covers that at
 * roughly 2x and still compresses to a few hundred kilobytes.
 */
export const DOCUMENT_EDGE = 1600;

/** Tried in order; the first result under this wins. */
const TARGET_BYTES = 400 * 1024;
const QUALITIES = [0.9, 0.8, 0.7];

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

export async function toWebp(file: File, maxEdge: number = MAX_EDGE): Promise<File> {
  if (file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";

    let smallest: Blob | null = null;
    for (const quality of QUALITIES) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= TARGET_BYTES) return new File([blob], name, { type: "image/webp" });
    }

    // Nothing hit the target — send the smallest attempt and let the route's
    // own ceiling decide. Better than silently uploading a 4 MB PNG.
    return smallest ? new File([smallest], name, { type: "image/webp" }) : file;
  } catch {
    return file;
  }
}
