"use client";

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "./types";

const EMPTY: Listing = {
  configured: true,
  folder: "",
  folders: [],
  files: [],
  truncated: false,
  canWrite: false,
};

/**
 * One folder's contents, refetched whenever the folder changes.
 *
 * `active` is what the picker uses to hold off until it is opened — a screen
 * holding twenty image fields should make no requests until one of them is
 * actually browsed. That reasoning is inherited from the dialog this replaces,
 * where it was a `useEffect` guarded on `open`.
 *
 * `reload` is exposed because uploading and deleting both change what is in the
 * folder and neither can predict the result: S3 has been read-after-write and
 * list-after-write consistent since 2020, so refetching is correct and leaves
 * one source of truth rather than a local copy that drifts.
 */
export function useFolder(folder: string, active = true) {
  const [listing, setListing] = useState<Listing>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by `reload`; the effect below watches it. */
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((count) => count + 1), []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/media/browse?folder=${encodeURIComponent(folder)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setError(data.error ?? "Could not load the media library.");
          // Not left showing the previous folder's contents under the new
          // breadcrumb, which would be a lie about where you are.
          setListing({ ...EMPTY, folder });
          return;
        }

        setListing(data as Listing);
      })
      .catch(() => {
        if (!cancelled) setError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folder, active, nonce]);

  return { listing, loading, error, reload };
}
