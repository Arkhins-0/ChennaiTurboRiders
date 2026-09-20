"use client";

import { useEffect, useRef, useState } from "react";
import { folderForEntity, folderForModule } from "@/lib/mediaPaths";
import { BLANK_TRACK, trackSlug, type Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { MapIcon, PlusIcon } from "@/admin/ui/icons";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { UploadFolder } from "@/admin/components/UploadFolder";
import { TrackForm } from "./TrackForm";

/**
 * The circuits, on the same three-column screen as every other editor.
 *
 * Sidebar, preview, fields — in that order across the screen, which is what the
 * landing and INCRC editors do, so nothing has to be relearned here. What
 * changes is only what the sidebar lists: those screens put the sections of one
 * page in it, and this puts the circuits themselves, because a circuit IS the
 * unit of work on this screen. Picking one in the rail opens its record on the
 * right and its page in the middle.
 *
 * That is also why the rail is draggable: the order of the rail is the order the
 * circuits appear in on the public list. There is no separate "arrange" mode for
 * the same reason there is no separate layout screen — the list you pick from
 * and the list the site is built from are one list.
 *
 * Each circuit is its own record, so Save writes the open one and only the open
 * one. Position is the exception: it belongs to the list rather than to any row,
 * so a drag saves itself, debounced, without touching anything else.
 */

/** A drag crosses several rows; wait for it to settle before writing. */
const ORDER_SAVE_DELAY = 500;

export function TracksEditor({ initialTracks }: { initialTracks: Track[] }) {
  // The sport this screen belongs to. Every write below names it, so the
  // server guards the right one — see SiteScope.
  const site = useSite();
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [saved, setSaved] = useState<Track[]>(initialTracks);

  const [activeId, setActiveId] = useState<string | null>(initialTracks[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = tracks.find((track) => track.id === activeId) ?? null;
  const activeSaved = saved.find((track) => track.id === activeId) ?? null;

  // Position is not compared: the list owns it and saves it on its own.
  const dirty =
    active && activeSaved
      ? (Object.keys(active) as (keyof Track)[]).some(
          (key) => key !== "sort_order" && active[key] !== activeSaved[key]
        )
      : false;

  /* ─────────────────────────── Order ─────────────────────────── */

  /** The order last written, so a drag that ends where it began posts nothing. */
  const savedOrder = useRef(initialTracks.map((track) => track.id).join(","));
  const orderTimer = useRef<number | null>(null);
  const pendingOrder = useRef<string[] | null>(null);

  // The one place a timer is cleared: a drag left in flight when the screen
  // closes would otherwise fire against an unmounted component.
  useEffect(() => {
    return () => {
      if (orderTimer.current !== null) window.clearTimeout(orderTimer.current);
    };
  }, []);

  async function writeOrder(ids: string[]) {
    const key = ids.join(",");
    if (key === savedOrder.current) return;

    // Optimistic: the rail is already in the new order. Only failure needs
    // saying, and the old order is still in the database if it comes to that.
    savedOrder.current = key;
    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/tracks", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not save the new order.");
      }
    } catch {
      setError("Network error while saving the order.");
    }
  }

  function queueOrder(list: Track[]) {
    pendingOrder.current = list.map((track) => track.id);

    if (orderTimer.current !== null) window.clearTimeout(orderTimer.current);
    orderTimer.current = window.setTimeout(() => {
      orderTimer.current = null;
      const ids = pendingOrder.current;
      if (ids) void writeOrder(ids);
    }, ORDER_SAVE_DELAY);
  }

  /** Moves `fromId` to the place `toId` currently holds. */
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;

    setTracks((current) => {
      const from = current.findIndex((track) => track.id === fromId);
      const to = current.findIndex((track) => track.id === toId);
      if (from < 0 || to < 0) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      queueOrder(next);
      return next;
    });
  }

  /* ─────────────────────────── Writes ─────────────────────────── */

  async function handleSave() {
    if (!active) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite(`/api/admin/tracks/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this circuit.");
        return;
      }

      // The server has trimmed and cleaned every field — the outline path above
      // all — so the draft is replaced with what actually landed.
      const track = data.track as Track;
      setTracks((current) => current.map((t) => (t.id === track.id ? track : t)));
      setSaved((current) => current.map((t) => (t.id === track.id ? track : t)));
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/tracks", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BLANK_TRACK,
          name: "New circuit",
          sort_order: (tracks.length + 1) * 10,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not add a circuit.");
        return;
      }

      const track = data.track as Track;
      setTracks((current) => [...current, track]);
      setSaved((current) => [...current, track]);
      savedOrder.current = [...tracks.map((t) => t.id), track.id].join(",");
      setActiveId(track.id);
      setJustSaved(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!active) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite(`/api/admin/tracks/${active.id}`, site), { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this circuit.");
        return;
      }

      const gone = active.id;
      const remaining = tracks.filter((track) => track.id !== gone);

      // Open a neighbour rather than nothing: an empty right-hand pane after a
      // delete reads as a screen that has broken.
      const position = tracks.findIndex((track) => track.id === gone);
      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);

      setTracks(remaining);
      setSaved((current) => current.filter((track) => track.id !== gone));
      savedOrder.current = remaining.map((track) => track.id).join(",");
      setConfirmingDelete(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: Track) {
    setTracks((current) => current.map((track) => (track.id === next.id ? next : track)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = tracks.map((track, index) => ({
    id: track.id,
    short: track.name || "Untitled circuit",
    title: `${String(index + 1).padStart(2, "0")} · ${track.name || "Untitled circuit"}`,
    hint: track.location || "No location set",
    // Present so the rail lets them be dragged. No `onToggleVisible` is passed,
    // so no eye appears: a circuit is not something you switch off, it is
    // something you delete.
    visible: true,
    Icon: MapIcon,
  }));

  /*
   * From the SAVED circuit, for the reason the decks editor gives at length: a
   * folder derived from a draft is a folder that may never come to exist.
   *
   * A circuit's address is frozen at creation, so unlike a deck's this one never
   * moves — see the note at the top of src/app/api/admin/tracks/[id]/route.ts.
   */
  const uploadFolder = activeSaved
    ? folderForEntity(site.slug, "circuits", trackSlug(activeSaved), activeSaved.id)
    : folderForModule(site.slug, "circuits");

  return (
    <UploadFolder folder={uploadFolder}>
    <div className="flex min-h-0 flex-col gap-2 md:h-full">
      <AdminRailSlot>
        <SectionRail
          heading="Circuits"
          items={railItems}
          active={activeId ?? ""}
          onSelect={setActiveId}
          onReorder={reorder}
        />
      </AdminRailSlot>

      <EditorToolbar
        Icon={MapIcon}
        title={active ? active.name || "Untitled circuit" : "Circuits"}
        hint={
          active
            ? "Drag the sidebar to set the order circuits appear in."
            : "No circuits yet — add the first one."
        }
        dirty={dirty}
        justSaved={justSaved}
        busy={busy}
        error={error}
        onSave={handleSave}
        actions={
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={busy}>
            <PlusIcon />
            Add circuit
          </Button>
        }
        fieldsOpen={fieldsOpen}
        onToggleFields={() => setFieldsOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2">

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card",
            fieldsOpen ? "" : "hidden"
          )}
        >
          <div className="mx-auto max-w-3xl space-y-2.5 bg-background/40 p-3">
            {active ? (
              confirmingDelete ? (
                <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-xs leading-relaxed text-foreground">
                    Delete <span className="font-medium">{active.name || "this circuit"}</span>?
                    This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                      {busy ? "Deleting…" : "Delete circuit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={busy}
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <TrackForm
                  track={active}
                  onChange={update}
                  onDelete={() => setConfirmingDelete(true)}
                  busy={busy}
                />
              )
            ) : (
              <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
                No circuits yet. Use <span className="text-foreground">Add circuit</span> above to
                make the first one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
    </UploadFolder>
  );
}
