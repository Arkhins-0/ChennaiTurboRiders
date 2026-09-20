"use client";

import { useRef, useState } from "react";
import { toWebp } from "@/lib/client/toWebp";
import { capturePoster } from "@/lib/client/videoPoster";
import {
  UNSUPPORTED_TYPE,
  UPLOAD_TYPES,
  isVideoUrl,
  maxBytesFor,
  megabytes,
  posterFor,
} from "@/lib/media";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Input, Label } from "@/admin/ui/Input";
import { FolderIcon, TrashIcon, UploadIcon } from "@/admin/ui/icons";
import { Hint } from "@/admin/components/Fields";
import { MediaPicker } from "@/admin/components/MediaPicker";
import { useUploadFolder } from "@/admin/components/UploadFolder";

/**
 * Picks a picture OR a video, four ways: drop a file on the tile, click the tile
 * to browse the disk, choose one already in S3, or paste a URL. The URL box
 * stays visible and editable throughout — it is the only route when S3 is not
 * configured.
 *
 * Every slot in this project that took an image now takes a video too, and they
 * all use this one field, so this is where that is true. Nothing about the
 * stored value changed: it is still one URL, and what it points at is read off
 * the extension — see src/lib/media.ts for why that is a fact about the address
 * rather than a second field.
 *
 * ── The two upload paths ──────────────────────────────────────────
 *
 *   a picture   converted to WebP here, then POSTed to /api/admin/upload. A few
 *               hundred kilobytes, and the server sees the bytes.
 *   a video     a signed PUT straight to S3. Nothing is converted — there is no
 *               transcoder here — and nothing passes through a serverless
 *               function, which could not hold it anyway.
 *
 * A video also has a frame captured from it and uploaded beside it, so the slot
 * shows a still rather than a black rectangle while it loads. The capture is
 * allowed to fail; the upload is not held up by it.
 *
 * `variant` decides how the tile shows what is in it:
 *   photo — wide, cropped to fill, on the dark surface
 *   logo  — square, fitted whole, on white, because crests carry their own dark
 *           ink and vanish against a near-black tile
 */
export function ImageField({
  label,
  value,
  onChange,
  disabled,
  hint,
  variant = "photo",
  maxEdge,
  className,
  folder,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: string;
  variant?: "photo" | "logo";
  /**
   * The longest edge an upload is resized to, when the default is wrong for
   * what this picture is. A deck page passes `DOCUMENT_EDGE`: it is read at
   * nearly full page width, where the default 768 arrives visibly soft.
   */
  maxEdge?: number;
  className?: string;
  /**
   * Where this one field's uploads go, when it differs from the screen's.
   *
   * Almost never needed — the folder comes from `UploadFolder` above, which is
   * what keeps the other twelve call sites unchanged. This is the escape hatch
   * for a field whose pictures belong somewhere its neighbours' do not.
   */
  folder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /** Only for a video, where a long upload with no sign of progress reads as a hang. */
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [dropping, setDropping] = useState(false);

  const screenFolder = useUploadFolder();
  const destination = folder ?? screenFolder;

  const isVideo = isVideoUrl(value);

  /** A picture: converted here, then through the server. */
  async function uploadImage(file: File) {
    const webp = await toWebp(file, maxEdge);

    const form = new FormData();
    form.append("file", webp);
    form.append("folder", destination);

    const response = await fetch("/api/admin/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error ?? "Upload failed.");
    return data.url as string;
  }

  /**
   * A video: a signed PUT straight to S3, with a frame captured beside it.
   *
   * The capture runs FIRST, while nothing is uploading, because it needs the
   * file decoded and doing that during the transfer competes for the same
   * decoder. It is allowed to return null.
   */
  async function uploadVideo(file: File) {
    const poster = await capturePoster(file);

    const signed = await fetch("/api/admin/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folder: destination,
        name: file.name,
        type: file.type,
        size: file.size,
      }),
    });

    const plan = await signed.json().catch(() => ({}));
    if (!signed.ok) throw new Error(plan.error ?? "Upload failed.");

    await put(plan.uploadUrl as string, plan.headers as Record<string, string>, file, setProgress);

    /*
     * The poster is best-effort and deliberately outside the failure path: the
     * video is already in the bucket, and refusing the whole upload because a
     * placeholder did not stick would be the wrong trade.
     */
    if (poster && plan.poster) {
      try {
        await put(plan.poster.uploadUrl, plan.poster.headers, poster, null);
      } catch {
        // Nothing to say. The video falls back to its own first frame.
      }
    }

    return plan.url as string;
  }

  async function upload(file: File) {
    const cap = maxBytesFor(file.type);
    if (!cap) {
      setError(UNSUPPORTED_TYPE);
      return;
    }
    if (file.size > cap) {
      setError(`That file is larger than ${megabytes(cap)}.`);
      return;
    }

    setUploading(true);
    setProgress(null);
    setError(null);

    try {
      const url = file.type.startsWith("video/")
        ? await uploadVideo(file)
        : await uploadImage(file);

      onChange(url);
    } catch (problem) {
      setError(
        problem instanceof Error && problem.message
          ? problem.message
          : "Upload failed. Check your connection and try again."
      );
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear immediately, so picking the same file twice fires this again.
    event.target.value = "";
    if (file) upload(file);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDropping(false);
    if (busy) return;

    const file = event.dataTransfer.files?.[0];
    // Anything that is neither a picture nor a video is a mis-drop, not an error
    // worth a message. A file of the right shape but the wrong type DOES get one,
    // from `upload` — that is somebody trying, not somebody slipping.
    if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) upload(file);
  }

  const busy = Boolean(disabled) || uploading;

  return (
    <div className={cn("block", className)}>
      <Label>{label}</Label>

      <div className="mt-1.5 flex gap-2.5">
        {/* The tile is the drop target and doubles as the file-browse button, so
            the commonest action is the biggest thing in the field. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={handleDrop}
          disabled={busy}
          title="Click to choose a file, or drop one here"
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border transition",
            "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
            variant === "logo" ? "size-[72px]" : "h-[72px] w-[112px]",
            value ? "border-border" : "border-dashed border-input",
            variant === "logo" && value ? "bg-white" : "bg-background",
            dropping && "border-primary bg-primary/10",
            busy && "opacity-60"
          )}
        >
          {value ? (
            // The tile shows a video the way the page will: muted, looping,
            // playing. What is in the box is what a visitor gets.
            isVideo ? (
              <video
                src={value}
                poster={posterFor(value) || undefined}
                autoPlay
                muted
                loop
                playsInline
                className={cn(
                  "h-full w-full",
                  variant === "logo" ? "object-contain p-1.5" : "object-cover"
                )}
              />
            ) : (
              <img
                src={value}
                alt=""
                className={cn(
                  "h-full w-full",
                  variant === "logo" ? "object-contain p-1.5" : "object-cover"
                )}
              />
            )
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-muted-fg">
              Drop
              <br />
              or click
            </span>
          )}

          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-[10px] font-medium text-primary">
              {progress === null ? "Uploading…" : `${progress}%`}
            </span>
          ) : null}
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="xs" onClick={() => inputRef.current?.click()} disabled={busy}>
              <UploadIcon />
              Upload
            </Button>

            <Button
              variant="outline"
              size="xs"
              onClick={() => setBrowsing(true)}
              disabled={busy}
              title="Choose from images already uploaded"
            >
              <FolderIcon />
              Library
            </Button>

            {value ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onChange("")}
                disabled={busy}
                aria-label="Clear image"
                title="Clear this image and fall back to the built-in default"
                className="hover:text-destructive"
              >
                <TrashIcon />
              </Button>
            ) : null}
          </div>

          {/* The URL on its own line: beside the buttons it collapsed to about
              forty pixels, which is unusable for the S3 URLs that go in it. */}
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={busy}
            placeholder="Image or video URL"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        // Built from the one table both upload routes read, so the picker
        // cannot offer something the server will refuse.
        accept={Object.keys(UPLOAD_TYPES).join(",")}
        onChange={handleFile}
        className="hidden"
      />

      {/* Opens where this field's uploads go. One value, two uses — the picker
          and the uploader cannot disagree about which folder is "here". */}
      <MediaPicker
        open={browsing}
        onClose={() => setBrowsing(false)}
        onSelect={onChange}
        startFolder={destination}
      />

      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <Hint className="mt-1">{hint}</Hint>
      ) : null}
    </div>
  );
}

/**
 * A PUT with a progress callback.
 *
 * `fetch` cannot report upload progress — there is no way to observe a request
 * body going out, and the streaming-request API that would allow it is not in
 * Safari. `XMLHttpRequest` can, and a two-hundred-megabyte upload with no sign
 * of movement reads as a hang, so this one place keeps the older API.
 *
 * The signed headers are echoed back EXACTLY as the route sent them. S3 signs
 * `Content-Type` and `Cache-Control` into the signature, so changing or dropping
 * one is a 403 — that is not a quirk to work around, it is the signature doing
 * its job.
 */
function put(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: ((percent: number) => void) | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);

    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);

    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }

    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`The storage service refused the upload (${request.status}).`));

    request.onerror = () =>
      reject(new Error("Upload failed. Check your connection and try again."));
    request.ontimeout = () => reject(new Error("The upload timed out."));

    request.send(body);
  });
}
