"use client";

import { useEffect, useRef, useState } from "react";
import { folderForEntity, folderForModule } from "@/lib/mediaPaths";
import { BLANK_DRIVER, driverName } from "@/lib/team";
import { cn } from "@/lib/utils";
import type { Driver } from "@/types/site";
import { Button } from "@/admin/ui/Button";
import { PlusIcon, UsersIcon } from "@/admin/ui/icons";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { UploadFolder } from "@/admin/components/UploadFolder";
import { DriverForm } from "./DriverForm";

/**
 * The roster, on the same screen shape as the circuits.
 *
 * The rail lists the drivers, picking one opens their record, and dragging the
 * rail sets the order they appear in on /drivers and in the reel on the home
 * page — there is no separate "arrange" mode, for the reason `TracksEditor`
 * gives: the list you pick from and the list the site is built from are one
 * list.
 *
 * Each driver is their own record, so Save writes the open one and only the
 * open one. Position is the exception: it belongs to the list rather than to
 * any row, so a drag saves itself, debounced, without touching anything else.
 *
 * There is no preview column. The circuits editor has one because a circuit is
 * drawn — a map, an outline, a card in a calendar — and a driver's record is a
 * name, some numbers and two photographs, which the fields already show.
 */

/** A drag crosses several rows; wait for it to settle before writing. */
const ORDER_SAVE_DELAY = 500;

export function DriversEditor({ initialDrivers }: { initialDrivers: Driver[] }) {
  const site = useSite();

  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [saved, setSaved] = useState<Driver[]>(initialDrivers);

  const [activeId, setActiveId] = useState<string | null>(initialDrivers[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = drivers.find((driver) => driver.id === activeId) ?? null;
  const activeSaved = saved.find((driver) => driver.id === activeId) ?? null;

  /*
   * Serialised rather than compared key by key, unlike the circuits editor.
   *
   * A `Track` is flat, so `Object.keys(...).some(...)` genuinely compares it. A
   * driver is not: `stats` is an object and `careerHighlights` is an array, and
   * a shallow comparison would call the record clean after somebody edited a
   * highlight — which is a Save button that stays grey over unsaved work.
   */
  const dirty = active && activeSaved ? JSON.stringify(active) !== JSON.stringify(activeSaved) : false;

  /* ─────────────────────────── Order ─────────────────────────── */

  const savedOrder = useRef(initialDrivers.map((driver) => driver.id).join(","));
  const orderTimer = useRef<number | null>(null);
  const pendingOrder = useRef<string[] | null>(null);

  // A drag left in flight when the screen closes would otherwise fire against
  // an unmounted component.
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
      const response = await fetch(withSite("/api/admin/drivers", site), {
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

  function queueOrder(list: Driver[]) {
    pendingOrder.current = list.map((driver) => driver.id);

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

    setDrivers((current) => {
      const from = current.findIndex((driver) => driver.id === fromId);
      const to = current.findIndex((driver) => driver.id === toId);
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
    setNote(null);

    try {
      const response = await fetch(withSite(`/api/admin/drivers/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this driver.");
        return;
      }

      // The server has trimmed and clamped every field, so the draft is
      // replaced with what actually landed.
      const driver = data.driver as Driver;
      setDrivers((current) => current.map((d) => (d.id === driver.id ? driver : d)));
      setSaved((current) => current.map((d) => (d.id === driver.id ? driver : d)));
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
    setNote(null);

    try {
      const response = await fetch(withSite("/api/admin/drivers", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...BLANK_DRIVER, firstName: "New", lastName: "Driver" }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not add a driver.");
        return;
      }

      const driver = data.driver as Driver;
      setDrivers((current) => [...current, driver]);
      setSaved((current) => [...current, driver]);
      savedOrder.current = [...drivers.map((d) => d.id), driver.id].join(",");
      setActiveId(driver.id);
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
    setNote(null);

    try {
      const response = await fetch(withSite(`/api/admin/drivers/${active.id}`, site), {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not delete this driver.");
        return;
      }

      const gone = active.id;
      const remaining = drivers.filter((driver) => driver.id !== gone);

      // Open a neighbour rather than nothing: an empty pane after a delete
      // reads as a screen that has broken.
      const position = drivers.findIndex((driver) => driver.id === gone);
      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);

      setDrivers(remaining);
      setSaved((current) => current.filter((driver) => driver.id !== gone));
      savedOrder.current = remaining.map((driver) => driver.id).join(",");
      setConfirmingDelete(false);

      // What the route says about pictures it could not tidy up. Not an error:
      // the driver is gone either way.
      const notes = Array.isArray(data.notes) ? (data.notes as string[]) : [];
      if (notes.length > 0) setNote(notes.join(" "));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: Driver) {
    setDrivers((current) => current.map((driver) => (driver.id === next.id ? next : driver)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = drivers.map((driver, index) => ({
    id: driver.id,
    short: driverName(driver) || "Untitled driver",
    title: `${String(index + 1).padStart(2, "0")} · ${driverName(driver) || "Untitled driver"}`,
    hint: [driver.number ? `#${driver.number}` : null, driver.championship || null]
      .filter(Boolean)
      .join(" · ") || "No number set",
    // Present so the rail lets them be dragged. No `onToggleVisible` is passed,
    // so no eye appears: a driver is not something you switch off.
    visible: true,
    Icon: UsersIcon,
  }));

  /*
   * From the SAVED driver, not the draft: a folder derived from an unsaved
   * record is a folder that may never come to exist. A driver's address is
   * frozen at creation, so unlike a deck's this one never moves.
   */
  const uploadFolder = activeSaved
    ? folderForEntity(site.slug, "drivers", activeSaved.slug, activeSaved.id)
    : folderForModule(site.slug, "drivers");

  return (
    <UploadFolder folder={uploadFolder}>
      <div className="flex min-h-0 flex-col gap-2 md:h-full">
        <AdminRailSlot>
          <SectionRail
            heading="Drivers"
            items={railItems}
            active={activeId ?? ""}
            onSelect={setActiveId}
            onReorder={reorder}
          />
        </AdminRailSlot>

        <EditorToolbar
          Icon={UsersIcon}
          title={active ? driverName(active) || "Untitled driver" : "Drivers"}
          hint={
            active
              ? "Drag the sidebar to set the order drivers appear in."
              : "No drivers yet — add the first one."
          }
          dirty={dirty}
          justSaved={justSaved}
          busy={busy}
          error={error}
          onSave={handleSave}
          actions={
            <Button variant="outline" size="sm" onClick={handleAdd} disabled={busy}>
              <PlusIcon />
              Add driver
            </Button>
          }
          fieldsOpen={fieldsOpen}
          onToggleFields={() => setFieldsOpen((open) => !open)}
        />

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card",
            fieldsOpen ? "" : "hidden"
          )}
        >
          <div className="mx-auto max-w-3xl space-y-2.5 bg-background/40 p-3">
            {note ? (
              <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-fg">
                {note}
              </p>
            ) : null}

            {active ? (
              confirmingDelete ? (
                <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-xs leading-relaxed text-foreground">
                    Delete <span className="font-medium">{driverName(active) || "this driver"}</span>?
                    Their page at /drivers/{active.slug} goes with them. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                      {busy ? "Deleting…" : "Delete driver"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={busy}
                    >
                      Keep them
                    </Button>
                  </div>
                </div>
              ) : (
                <DriverForm
                  driver={active}
                  onChange={update}
                  onDelete={() => setConfirmingDelete(true)}
                  busy={busy}
                />
              )
            ) : (
              <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
                No drivers yet. Use <span className="text-foreground">Add driver</span> above to make
                the first one.
              </p>
            )}
          </div>
        </div>
      </div>
    </UploadFolder>
  );
}
