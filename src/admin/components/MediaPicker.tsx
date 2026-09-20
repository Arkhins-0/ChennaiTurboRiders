"use client";

import { useEffect, useState } from "react";
import { Button } from "@/admin/ui/Button";
import { Dialog } from "@/admin/ui/Dialog";
import { ErrorNote } from "@/admin/components/Fields";
import { Breadcrumb } from "@/admin/components/media/Breadcrumb";
import { Empty, FileTile, FolderTile } from "@/admin/components/media/Tiles";
import { UploadZone } from "@/admin/components/media/UploadZone";
import type { MediaObject } from "@/admin/components/media/types";
import { useFolder } from "@/admin/components/media/useFolder";

/**
 * Browses what has been uploaded and hands back a URL.
 *
 * Fetches on open rather than on mount, so the list is fresh every time and a
 * screen holding twenty image fields makes no requests until one is opened.
 *
 * ── What changed when folders arrived ─────────────────────────────────────
 *
 * This was a flat grid over every object in the bucket. It now walks the folder
 * tree, and it opens in the folder the field it belongs to uploads INTO —
 * `startFolder`, passed down from `ImageField`. Browsing to a folder is the
 * folder chooser; a dropdown beside a breadcrumb pointing somewhere else would
 * be two answers to one question.
 *
 * It shows only folders this account may browse, because the route returns only
 * those. A page editor cannot pick another page's picture out of this dialog,
 * which is the point — and it is the SERVER's answer being drawn, never one
 * worked out here.
 *
 * ── There is still no delete here, and now for a better reason ────────────
 *
 * The old note said an object might be referenced by content this dialog cannot
 * see. That is now SOLVED rather than merely true — there is a usage scan, a
 * two-step confirm and a permission gate over it. But that machinery belongs on
 * /media, not in a dialog somebody opened to pick a logo: choosing a picture and
 * tidying a bucket are different jobs, and only one of them is irreversible.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  startFolder = "",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  /** Where to open. Defaults to the root, where the older uploads live. */
  startFolder?: string;
}) {
  const [folder, setFolder] = useState(startFolder);

  /*
   * Re-homed each time it opens, not once on mount.
   *
   * The deck being edited can change while this dialog is closed, and a picker
   * that reopened in the folder of the deck before last would be quietly
   * pointing at the wrong place. Deliberately NOT a remembered
   * `localStorage` folder: `startFolder` always carries a good answer, and a
   * remembered one could be a folder this account may no longer browse.
   */
  useEffect(() => {
    if (open) setFolder(startFolder);
  }, [open, startFolder]);

  const { listing, loading, error, reload } = useFolder(folder, open);

  function choose(file: MediaObject) {
    onSelect(file.url);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Media library"
      description={
        loading
          ? "Loading…"
          : `${listing.files.length} file${listing.files.length === 1 ? "" : "s"} here`
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Breadcrumb folder={folder} onOpen={setFolder} />
        <Button variant="link" size="xs" className="ml-auto" onClick={reload} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : !listing.configured ? (
        <Empty>
          Media storage is not configured. Set the S3_* variables in .env, or paste an image URL
          instead.
        </Empty>
      ) : loading ? (
        <Empty>Loading…</Empty>
      ) : listing.folders.length === 0 && listing.files.length === 0 ? (
        <Empty>
          {folder
            ? "This folder is empty. Upload below, or go up and look elsewhere."
            : "Nothing uploaded yet. Use Upload on any image field and it will appear here."}
        </Empty>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {listing.folders.map((entry) => (
            <FolderTile key={entry.path} folder={entry} onOpen={setFolder} />
          ))}

          {listing.files.map((file) => (
            <FileTile key={file.key} file={file} onPick={choose} />
          ))}
        </ul>
      )}

      {listing.configured && listing.canWrite ? (
        <div className="mt-3">
          <UploadZone folder={folder} onDone={reload} disabled={loading} />
        </div>
      ) : null}
    </Dialog>
  );
}
