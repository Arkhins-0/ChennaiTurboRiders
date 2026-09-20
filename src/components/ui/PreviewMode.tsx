"use client";

import { createContext, useContext } from "react";

/**
 * Marks a subtree as "this is the console's preview pane, not the real page".
 *
 * Two things read it. `Reveal` animates on scroll, and inside the preview those
 * elements would sit at opacity 0 forever — they never enter the *window's*
 * viewport, because they are in a scrolling panel that is also scaled. The
 * banner carousel stops rotating, and holds on whichever banner is open in the
 * editor.
 *
 * Deliberately a context rather than a prop: it would otherwise have to be
 * threaded through every section and every heading to reach one component. The
 * banner index is here for the same reason and one more — the section that draws
 * the carousel is chosen by the registry, so there is no prop path from the
 * editor to it at all.
 */
type PreviewState = {
  /** Rendering inside the console's preview pane. */
  preview: boolean;
  /** Hold the carousel on this banner. Undefined lets it rotate on its own. */
  bannerIndex?: number;
};

const PreviewModeContext = createContext<PreviewState>({ preview: false });

export function usePreviewMode(): boolean {
  return useContext(PreviewModeContext).preview;
}

/** Which banner the preview is holding on, if any. */
export function usePreviewBanner(): number | undefined {
  return useContext(PreviewModeContext).bannerIndex;
}

export function PreviewMode({
  children,
  bannerIndex,
}: {
  children: React.ReactNode;
  bannerIndex?: number;
}) {
  return (
    <PreviewModeContext.Provider value={{ preview: true, bannerIndex }}>
      {children}
    </PreviewModeContext.Provider>
  );
}
