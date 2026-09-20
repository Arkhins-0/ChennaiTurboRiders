/**
 * Browser-side: pull a still out of a video so a slot has something to show
 * before the video starts.
 *
 * A `<video>` with no poster is a black rectangle until its first frame decodes,
 * and on a banner that is the first thing a visitor sees. This captures a frame
 * at upload time and the upload route stores it beside the video under the same
 * stem, where `posterFor` in src/lib/media.ts can find it by swapping the
 * extension.
 *
 * ── Why in the browser ────────────────────────────────────────────────────
 *
 * The same argument `toWebp` makes: the alternative is ffmpeg in a serverless
 * bundle, for one frame. The machine that has the file already has a decoder for
 * it, and the file never has to reach a server that cannot hold it — a video
 * goes to S3 by a signed PUT, so no server ever sees the bytes at all.
 *
 * ── Failing is fine ───────────────────────────────────────────────────────
 *
 * Returns null rather than throwing, for a codec the browser cannot decode, a
 * file that seeks nowhere, or a canvas the browser refuses to read back. The
 * upload carries on without a poster and the video falls back to its first
 * frame, which is what a slot with no poster does anyway. A capture that failed
 * must never cost somebody their upload.
 */

/** Far enough in to be past a fade from black, short enough for a clip. */
const SEEK_TO = 1;

/** Big enough for a full-bleed banner, small enough to be a still and not a page weight. */
const MAX_EDGE = 1600;

/** A poster is a placeholder for a second; it does not need to be pristine. */
const QUALITY = 0.72;

/** Nothing has decoded by then, and a hung <video> must not hang the upload. */
const TIMEOUT_MS = 12_000;

export async function capturePoster(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/")) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");

  try {
    return await withTimeout(draw(video, url), TIMEOUT_MS);
  } catch {
    return null;
  } finally {
    // Both, always. An object URL is a reference the tab holds until it is
    // revoked, and a detached <video> with a src goes on buffering.
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function draw(video: HTMLVideoElement, url: string): Promise<Blob | null> {
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Required to read the canvas back: a video from another origin taints it and
  // `toBlob` then throws. An object URL is same-origin, so this only matters if
  // this is ever pointed at a remote file.
  video.crossOrigin = "anonymous";
  video.src = url;

  await once(video, "loadedmetadata");

  // A clip shorter than the seek point is captured at its own midpoint rather
  // than at its end, which on a fade-out is a frame of nothing.
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = duration > SEEK_TO ? SEEK_TO : duration / 2;

  // `seeked` says the position moved; `loadeddata` says there is a frame there
  // to draw. Waiting for the wrong one gives a blank canvas on Safari.
  await Promise.all([once(video, "seeked"), readyForDrawing(video)]);

  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
}

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener("error", () => reject(new Error(`video ${event} failed`)), {
      once: true,
    });
  });
}

/** `readyState >= HAVE_CURRENT_DATA` — there is a frame at the current position. */
function readyForDrawing(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return once(video, "loadeddata");
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}
