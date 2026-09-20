"use client";

import { useRef, useState } from "react";
import { toWebp } from "@/lib/client/toWebp";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { UploadIcon } from "@/admin/ui/icons";
import { ErrorNote } from "@/admin/components/Fields";

/**
 * Files into the folder currently open, by drop or by button.
 *
 * Modelled on `AddPages` in DeckForm — sequential rather than parallel, with
 * `{done,total}` progress, per-file failure counting, and the FIRST server
 * sentence kept, because "3 files failed: Image is larger than 4 MB" is useful
 * and "3 files failed" is not.
 *
 * The destination is named on the button (`Upload to decks/world-of-ctr`)
 * rather than offered as a separate control. Browsing to a folder IS the folder
 * chooser; a dropdown beside a breadcrumb pointing somewhere else would be two
 * answers to one question.
 */
export function UploadZone({
  folder,
  onDone,
  disabled,
}: {
  folder: string;
  onDone: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = Boolean(disabled) || progress !== null;

  async function send(files: File[]) {
    if (files.length === 0) return;

    setError(null);
    let failed = 0;
    let reason = "";

    for (const [index, file] of files.entries()) {
      setProgress({ done: index, total: files.length });

      try {
        // Same conversion every other uploader in this admin does, so what is
        // stored is already what the page serves. Anything that is not an image
        // is sent untouched — there is no `toWebp` for a PDF.
        const body = new FormData();
        body.append("file", file.type.startsWith("image/") ? await toWebp(file) : file);
        body.append("folder", folder);

        const response = await fetch("/api/admin/upload", { method: "POST", body });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          failed += 1;
          if (!reason && typeof data.error === "string") reason = data.error;
        }
      } catch {
        failed += 1;
      }
    }

    setProgress(null);

    if (failed > 0) {
      setError(
        `${failed === 1 ? "One file" : `${failed} files`} could not be uploaded.${
          reason ? ` ${reason}` : ""
        }`
      );
    }

    // Always, even after failures: the ones that worked are in the bucket and
    // the listing is the only source of truth for what is there.
    onDone();
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropping(false);
          if (!busy) send(Array.from(event.dataTransfer.files ?? []));
        }}
        className={cn(
          "flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5 transition",
          dropping ? "border-primary bg-primary/10" : "border-input",
          busy && "opacity-60"
        )}
      >
        <p className="min-w-0 truncate text-xs text-muted-fg">
          {progress
            ? `Uploading ${progress.done + 1} of ${progress.total}…`
            : `Drop files here to add them to ${folder || "the media root"}`}
        </p>

        <Button
          variant="outline"
          size="xs"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <UploadIcon />
          Upload
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // Cleared at once, so choosing the same files again fires this again.
          event.target.value = "";
          send(picked);
        }}
        className="hidden"
      />

      {error ? (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </div>
  );
}
