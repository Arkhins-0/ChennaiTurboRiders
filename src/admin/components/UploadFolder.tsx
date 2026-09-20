"use client";

import { createContext, useContext } from "react";
import { DEFAULT_UPLOAD_FOLDER } from "@/lib/mediaPaths";

/**
 * Where the pictures on this screen go.
 *
 * ── Why a context and not a prop ──────────────────────────────────────────
 *
 * `ImageField` is used in thirteen places and almost none of them knows what it
 * is part of. `BannersPanel` is rendered by BOTH the landing and the INCRC
 * editor, so a banner belongs to whichever page is being edited and the panel
 * itself cannot say which. `SportRow` sits inside a `Repeater` inside the
 * landing editor. Threading a folder down to those by hand means editing every
 * intermediate component that has no other reason to know about folders — and
 * an OPTIONAL prop is worse than that, because the one place somebody forgets it
 * fails silently by uploading to the wrong folder rather than loudly.
 *
 * The folder is a property of the SCREEN and of a component's position in it,
 * which is what a context is for. Providers nest, so the landing editor can say
 * `landing` once and `SportRow` can override its own subtree with
 * `landing/sports` without anything in between being involved.
 *
 * `AdminShell` already establishes screen-scoped-value-through-context here —
 * see `CollapsedContext` and `AdminRailSlot` — so this is not a new idea in this
 * codebase, only a second use of an existing one.
 *
 * ── The default ───────────────────────────────────────────────────────────
 *
 * A field outside any provider uploads to the shared folder, never to the root.
 * The root is where every upload made before folders existed still sits, and it
 * is owner-only for writes; a screen nobody has wrapped yet should degrade to a
 * folder its editor can actually reach.
 */
const UploadFolderContext = createContext<string>(DEFAULT_UPLOAD_FOLDER);

export function UploadFolder({
  folder,
  children,
}: {
  folder: string;
  children: React.ReactNode;
}) {
  return <UploadFolderContext.Provider value={folder}>{children}</UploadFolderContext.Provider>;
}

export function useUploadFolder(): string {
  return useContext(UploadFolderContext);
}
