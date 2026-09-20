"use client";

import { useEffect, useMemo, useState } from "react";
import { parentFolder } from "@/lib/mediaPaths";
import { cn } from "@/lib/utils";
import { Badge } from "@/admin/ui/Badge";
import { Button } from "@/admin/ui/Button";
import { Input } from "@/admin/ui/Input";
import { FolderIcon, FolderPlusIcon, SearchIcon } from "@/admin/ui/icons";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { ErrorNote } from "@/admin/components/Fields";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { Breadcrumb } from "@/admin/components/media/Breadcrumb";
import { DeleteMediaDialog } from "@/admin/components/media/DeleteMediaDialog";
import { NewFolderDialog } from "@/admin/components/media/NewFolderDialog";
import { Empty, FileTile, FolderTile } from "@/admin/components/media/Tiles";
import { UploadZone } from "@/admin/components/media/UploadZone";
import { nameOfKey } from "@/admin/components/media/format";
import type { MediaObject } from "@/admin/components/media/types";
import { useFolder } from "@/admin/components/media/useFolder";

/**
 * The file explorer.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * Until this existed the bucket could be written to and never read back: the
 * only window onto it was a read-only grid inside an image field, with no
 * folders, no search and no delete. Orphans accumulated by design. This is the
 * screen where media is managed AS media.
 *
 * ── What each account sees ────────────────────────────────────────────────
 *
 * Only its own pages' folders. The rail lists the roots the server said were
 * visible, the grid lists what the server returned, and the delete controls are
 * drawn from the `canWrite` the server sent — the browser never decides an
 * authorisation question, it only draws the answer. Every route re-checks
 * regardless, because a UI that hides a button is not protection.
 *
 * ── Why the loose files at the root are still reachable ───────────────────
 *
 * The media root holds every upload made before folders existed, and that is
 * currently most of the pictures on the site. They are not being moved: they are
 * named by a bare uuid, so there is no record to attribute one to and no site to
 * file it under — the decision is recorded in
 * docs/uploads by folder structure.md. The root of this tree is where they live
 * and they are as browsable as anything else.
 *
 * Everything ELSE is now under a site. `decks/`, `circuits/` and `articles/`
 * were top-level folders named after a module until phase 6 moved them, and the
 * rail no longer has a shape for a folder that belongs to no site but is not
 * shared.
 */
export function MediaLibrary({
  initialFolder = "",
  configured,
  roots,
}: {
  initialFolder?: string;
  configured: boolean;
  roots: string[];
}) {
  const [folder, setFolder] = useState(initialFolder);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [makingFolder, setMakingFolder] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  const { listing, loading, error, reload } = useFolder(folder, configured);

  /*
   * A selection that survives a folder change is one you can no longer see, and
   * the button above it would then delete files from somewhere else. Cleared on
   * every move — the same argument the decks editor makes about its delete
   * confirmation.
   */
  useEffect(() => {
    setSelected(new Set());
    setFilter("");
  }, [folder]);

  const files = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return listing.files;
    return listing.files.filter((file) => nameOfKey(file.key).toLowerCase().includes(needle));
  }, [listing.files, filter]);

  const folders = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return listing.folders;
    return listing.folders.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [listing.folders, filter]);

  const railItems: RailItem<string>[] = [
    {
      id: "",
      short: "All",
      title: "All media",
      hint: "Everything, including the older uploads",
      Icon: FolderIcon,
    },
    // No `visible` on any of these, so no drag handle and no eye appears: these
    // are places, not sections of a page, and there is nothing to reorder.
    ...roots.map((root) => ({
      id: root,
      short: root,
      title: root,
      hint: "",
      Icon: FolderIcon,
    })),
  ];

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function copy(file: MediaObject) {
    navigator.clipboard?.writeText(file.url).catch(() => {
      // No toast system here, and this plan does not add one. A copy that fails
      // is not worth an error box — the URL is visible in the tile's title.
    });
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 md:h-full">
      <AdminRailSlot>
        <SectionRail
          heading="Folders"
          items={railItems}
          // The rail marks the TOP-LEVEL folder you are inside; depth is the
          // breadcrumb's job, not a second tree to keep in step with it.
          active={folder.split("/")[0]}
          onSelect={setFolder}
        />
      </AdminRailSlot>

      {/* Not `EditorToolbar`: its contract is dirty/justSaved/onSave, and this
          screen has nothing to save. Passing `dirty={false}` for ever would be
          furniture pretending to be state. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <FolderIcon className="size-4 text-muted-fg" />
        <Breadcrumb folder={folder} onOpen={setFolder} />

        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-fg">
            {listing.folders.length} folder{listing.folders.length === 1 ? "" : "s"} ·{" "}
            {listing.files.length} file{listing.files.length === 1 ? "" : "s"}
          </span>

          <span className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-fg" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by name"
              className="h-8 w-44 pl-7 text-xs"
            />
          </span>

          {listing.canWrite ? (
            <Button variant="outline" size="xs" onClick={() => setMakingFolder(true)}>
              <FolderPlusIcon />
              New folder
            </Button>
          ) : null}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
        {!configured ? (
          <Empty>
            Media storage is not configured. Set the S3_* variables in .env and reload.
          </Empty>
        ) : (
          <>
            {error ? <ErrorNote>{error}</ErrorNote> : null}

            {listing.canWrite ? (
              <UploadZone folder={folder} onDone={reload} disabled={loading} />
            ) : null}

            {selected.size > 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                <Badge>{selected.size} selected</Badge>
                <span className="ml-auto flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                  <Button variant="destructive" size="xs" onClick={() => setDeletingFiles(true)}>
                    Delete
                  </Button>
                </span>
              </div>
            ) : null}

            {listing.truncated ? (
              <p className="text-[11px] text-muted-fg">
                This folder holds more than could be listed at once. Use the filter, or open a
                subfolder.
              </p>
            ) : null}

            {loading ? (
              <Empty>Loading…</Empty>
            ) : folders.length === 0 && files.length === 0 ? (
              <Empty>
                {filter
                  ? "Nothing here matches that."
                  : folder
                    ? "This folder is empty."
                    : "Nothing uploaded yet."}
              </Empty>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {/* Folders first, then files: a folder is a place and you look
                    for it by name, a file is a thing you just uploaded and you
                    look for it at the top. */}
                {folders.map((entry) => (
                  <FolderTile
                    key={entry.path}
                    folder={entry}
                    onOpen={setFolder}
                    // One at a time, never by checkbox — "these four files and
                    // that folder with its two hundred children" cannot be
                    // confirmed honestly in one sentence.
                    onDelete={listing.canWrite ? setDeletingFolder : undefined}
                  />
                ))}

                {files.map((file) => (
                  <FileTile
                    key={file.key}
                    file={file}
                    selected={selected.has(file.key)}
                    onPick={copy}
                    onToggle={listing.canWrite ? toggle : undefined}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <NewFolderDialog
        open={makingFolder}
        onClose={() => setMakingFolder(false)}
        parent={folder}
        onCreated={(made) => {
          setFolder(made);
          reload();
        }}
      />

      <DeleteMediaDialog
        open={deletingFiles}
        onClose={() => setDeletingFiles(false)}
        keys={[...selected]}
        onDeleted={() => {
          setSelected(new Set());
          reload();
        }}
      />

      <DeleteMediaDialog
        open={deletingFolder !== null}
        onClose={() => setDeletingFolder(null)}
        folder={deletingFolder ?? ""}
        onDeleted={() => {
          // Back to the parent: staying inside a folder that has just been
          // deleted shows an empty listing that looks like a failure.
          if (deletingFolder === folder) setFolder(parentFolder(folder));
          reload();
        }}
      />
    </div>
  );
}
