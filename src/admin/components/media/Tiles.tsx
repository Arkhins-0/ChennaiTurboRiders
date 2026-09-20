"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { FileIcon, FolderIcon, TrashIcon } from "@/admin/ui/icons";
import { posterFor } from "@/lib/media";
import { extensionOf, formatBytes, isImageKey, isVideoKey, nameOfKey } from "./format";
import type { MediaFolder, MediaObject } from "./types";

/**
 * The two things a folder listing is made of.
 *
 * Shared between the picker and the `/media` screen — the LEAVES are shared and
 * the shells are not, which is the whole of how those two relate. A single
 * browser component with a `mode` prop would differ in the selection model, in
 * what a click does, in whether delete exists and in whether a checkbox is
 * drawn: four conditionals, and a component that reads badly for both jobs.
 *
 * One click descends, and one click selects. This is a grid of buttons in a web
 * page, not a desktop; a double-click would be the only one in the admin.
 */

export function FolderTile({
  folder,
  onOpen,
  onDelete,
}: {
  folder: MediaFolder;
  onOpen: (path: string) => void;
  /** Absent hides the control entirely — the picker has no delete. */
  onDelete?: (path: string) => void;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(folder.path)}
        title={folder.path}
        className="flex w-full flex-col items-center gap-1.5 rounded-md border border-border bg-background px-2 py-4 outline-none transition hover:border-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <FolderIcon className="size-7 text-muted-fg" />
        <span className="w-full truncate text-center text-[11px] text-foreground">
          {folder.name}
        </span>
      </button>

      {onDelete ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onDelete(folder.path)}
          aria-label={`Delete the folder ${folder.name}`}
          title="Delete this folder and everything in it"
          // Shown on hover, and on focus so it is reachable from the keyboard.
          className="absolute right-1 top-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
        >
          <TrashIcon />
        </Button>
      ) : null}
    </li>
  );
}

export function FileTile({
  file,
  selected,
  onPick,
  onToggle,
}: {
  file: MediaObject;
  selected?: boolean;
  /** The primary action: choose it in the picker, or open it on the screen. */
  onPick: (file: MediaObject) => void;
  /** Absent hides the checkbox — the picker selects exactly one thing, by picking it. */
  onToggle?: (key: string) => void;
}) {
  const name = nameOfKey(file.key);

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onPick(file)}
        title={`${name} · ${formatBytes(file.size)}`}
        className={cn(
          "block w-full overflow-hidden rounded-md border bg-background outline-none transition",
          "hover:border-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
          selected ? "border-primary ring-[3px] ring-primary/30" : "border-border"
        )}
      >
        {isImageKey(file.key) ? (
          <img
            src={file.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square w-full object-contain p-1"
          />
        ) : isVideoKey(file.key) ? (
          /*
           * The poster if there is one, and the video itself if there is not.
           *
           * `preload="metadata"` and no autoplay, unlike everywhere else: a
           * folder of twenty clips all playing at once is a browser brought to
           * its knees, and this grid is for finding a file rather than watching
           * one. Hovering plays it, which is enough to tell two apart.
           */
          <video
            src={file.url}
            poster={posterFor(file.url) || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})}
            onMouseLeave={(event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
            className="aspect-square w-full bg-black object-contain"
          />
        ) : (
          // One icon and the extension as text, rather than eight bespoke
          // glyphs. "PDF" tells a reader more than a drawing of one would.
          <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-muted-fg">
            <FileIcon className="size-7" />
            <span className="text-[10px] font-medium tracking-wide">{extensionOf(file.key)}</span>
          </span>
        )}

        <span className="block truncate border-t border-border px-1.5 py-1 text-[10px] text-muted-fg">
          {name}
        </span>
      </button>

      {onToggle ? (
        <label
          className={cn(
            "absolute left-1 top-1 flex size-5 cursor-pointer items-center justify-center rounded border border-border bg-card transition",
            selected ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          )}
        >
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggle(file.key)}
            aria-label={`Select ${name}`}
            className="size-3 accent-primary"
          />
        </label>
      ) : null}
    </li>
  );
}

/** The shared empty/loading treatment, lifted out of the old MediaPicker. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-xs text-muted-fg">{children}</p>;
}
