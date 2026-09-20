"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/admin/ui/Badge";
import { Button } from "@/admin/ui/Button";
import { Dialog } from "@/admin/ui/Dialog";
import { ErrorNote } from "@/admin/components/Fields";
import { nameOfKey } from "./format";
import type { KeyUsage } from "./types";

/**
 * The one dialog in front of every delete — files and folders alike.
 *
 * ── Why a scan happens before the button is even offered ──────────────────
 *
 * Deleting an object does not un-break a page. Every upload carries
 * `max-age=31536000, immutable`, so a browser or a CDN may go on serving a
 * deleted file for up to a year: the delete has no visible effect at all, and
 * then, months later, a picture vanishes from a page nobody was editing. There
 * is no undo and no obvious cause. That gap between the action and the
 * consequence is why the scan is mandatory rather than advisory, and why the
 * sentence below is in words rather than a warning triangle.
 *
 * ── The three states ──────────────────────────────────────────────────────
 *
 *   checking   the scan is running
 *   clean      nothing points at these, one press deletes
 *   in use     what points at them, and either a two-press "Delete anyway" or,
 *              if any of it is on a page this account cannot edit, no delete at
 *              all and the name of the page to go and ask about
 *
 * ── The race, handled rather than ignored ─────────────────────────────────
 *
 * The scan is a snapshot, not a lock — somebody can save a page in the seconds
 * between this opening and the button being pressed. The server re-checks on
 * confirm and answers 409 again with the fresh references; this re-renders them
 * and goes back to needing two presses. That is the correct handling of it.
 */
export function DeleteMediaDialog({
  open,
  onClose,
  onDeleted,
  keys,
  folder,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  /** Files to remove. Ignored when `folder` is given. */
  keys?: string[];
  /** A whole folder, and everything under it. */
  folder?: string;
}) {
  const [usage, setUsage] = useState<KeyUsage[] | null>(null);
  const [canOverride, setCanOverride] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = folder ? 0 : (keys?.length ?? 0);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setChecking(true);
    setError(null);
    setArmed(false);
    setUsage(null);

    fetch("/api/admin/media/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(folder !== undefined ? { folder } : { keys }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setError(data.error ?? "Could not check whether these are in use.");
          return;
        }

        setUsage((data.usage as KeyUsage[]) ?? []);
        setCanOverride(data.canOverride !== false);
      })
      .catch(() => {
        if (!cancelled) setError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
    // `keys` is a fresh array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder, (keys ?? []).join(",")]);

  const inUse = (usage?.length ?? 0) > 0;

  async function remove() {
    // In use, and not yet armed: the first press only arms the second.
    if (inUse && !armed) {
      setArmed(true);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        folder !== undefined ? "/api/admin/media/folders" : "/api/admin/media",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            folder !== undefined ? { folder, confirm: true } : { keys, confirm: true }
          ),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Somebody saved a page while this was open. Show what is true now and
        // make them agree to it again.
        if (response.status === 409 && Array.isArray(data.usage)) {
          setUsage(data.usage as KeyUsage[]);
          setArmed(false);
        }

        setError(data.error ?? "Could not delete that.");
        return;
      }

      onDeleted();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const what = folder ? `the folder “${folder}”` : count === 1 ? "1 file" : `${count} files`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={folder ? "Delete this folder" : "Delete these files"}
      description={checking ? "Checking what points at them…" : undefined}
      className="max-w-xl"
    >
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {checking ? (
        <p className="py-6 text-center text-xs text-muted-fg">Checking…</p>
      ) : usage === null ? null : inUse ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-foreground">
            {usage.length === 1 ? "One file is" : `${usage.length} files are`} still being used:
          </p>

          <ul className="space-y-1.5">
            {usage.map((row) => (
              <li key={row.key} className="rounded-md border border-border bg-background p-2">
                <p className="truncate text-[11px] font-medium text-foreground">
                  {nameOfKey(row.key)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.refs.map((ref) => (
                    <Badge key={`${ref.kind}:${ref.label}`} variant="destructive">
                      {ref.label}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs leading-relaxed text-foreground">
            Deleting these will leave a broken picture wherever they are used. Browsers and caches
            may go on showing them for up to a year, so this will not fix a page — it only breaks it
            later.
          </p>

          {canOverride ? null : (
            <p className="text-xs leading-relaxed text-muted-fg">
              Some of these are on a page your account cannot edit, so they cannot be deleted here.
              Ask whoever looks after that page to take them off it first.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-foreground">
          Nothing on this site points at {what}. This cannot be undone.
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
          Keep {folder ? "it" : count === 1 ? "it" : "them"}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={remove}
          disabled={busy || checking || usage === null || (inUse && !canOverride)}
        >
          {busy
            ? "Deleting…"
            : inUse
              ? armed
                ? "Yes, delete anyway"
                : "Delete anyway"
              : `Delete ${folder ? "folder" : count === 1 ? "file" : "files"}`}
        </Button>
      </div>
    </Dialog>
  );
}
