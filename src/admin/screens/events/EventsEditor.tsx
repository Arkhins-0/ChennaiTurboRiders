"use client";

import { useEffect, useRef, useState } from "react";
import {
  BLANK_EVENT,
  EVENT_STATUS_LABELS,
  eventName,
  type CtrEvent,
} from "@/lib/events";
import { folderForEntity, folderForModule } from "@/lib/mediaPaths";
import { eventDateLabel } from "@/lib/raceDates";
import type { SlugHolder } from "@/lib/slug";
import type { Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { CalendarIcon, PlusIcon } from "@/admin/ui/icons";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { Note, Panel } from "@/admin/components/Fields";
import { NewRecord } from "@/admin/components/NewRecord";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { UploadFolder } from "@/admin/components/UploadFolder";
import { EventPreview } from "@/admin/components/previews/EventPreview";
import { EventForm } from "./EventForm";

/**
 * One sport's season, on the same three-column screen as every other editor.
 *
 * Sidebar, preview, fields — and the rail lists the events themselves, in the
 * order the season runs. This screen is what migration 0018 was for: a round
 * used to be a row in a repeater inside the calendar band's panel, saved with
 * the page it sat on, and there was nowhere to put a report, a cover or an entry
 * link because there was no row to put them on.
 *
 * Modelled on `ArticlesEditor`, with one difference worth naming: the list is
 * one sport's, not "whatever this account may reach". A season belongs to a
 * sport, so the screen is per sport and the server has already guarded it.
 *
 * Each event is its own row, so Save writes the open one and only the open one.
 * Position is the exception: it belongs to the list rather than to any row, so a
 * drag saves itself, debounced, without touching anything else — and the order
 * of this list IS the order the calendar band draws.
 */

/** A drag crosses several rows; wait for it to settle before writing. */
const ORDER_SAVE_DELAY = 500;

export function EventsEditor({
  initialEvents,
  tracks,
  siteUrl,
}: {
  initialEvents: CtrEvent[];
  /** This sport's circuits, for the picker and the preview's photograph. */
  tracks: Track[];
  siteUrl: string;
}) {
  // The sport this screen belongs to. Every write below names it, so the server
  // guards the right one — see SiteScope.
  const site = useSite();
  const [events, setEvents] = useState<CtrEvent[]>(initialEvents);
  const [saved, setSaved] = useState<CtrEvent[]>(initialEvents);

  const [activeId, setActiveId] = useState<string | null>(initialEvents[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the server tidied on the last write, and WHICH event it tidied. */
  const [notes, setNotes] = useState<{ id: string; list: string[] } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);

  const active = events.find((event) => event.id === activeId) ?? null;
  const activeSaved = saved.find((event) => event.id === activeId) ?? null;

  /*
   * Everything belonging to the OPEN event is dropped when a different one is
   * opened — the delete confirmation above all. Left standing it is a red button
   * aimed at whichever event is now selected, which is the one unrecoverable
   * action on the screen fired by a stale flag.
   */
  useEffect(() => {
    setConfirmingDelete(false);
    setJustSaved(false);
    setError(null);
    setAdding(false);
  }, [activeId]);

  /*
   * Position is not compared: the list owns it and saves it on its own.
   *
   * A shallow per-key compare, like the articles screen. It works for `body`
   * because the two lists share one object reference until something changes it:
   * the editor hands up a NEW document on every keystroke, and a save replaces
   * both copies with the server's single object.
   */
  const dirty =
    active && activeSaved
      ? (Object.keys(active) as (keyof CtrEvent)[]).some(
          (key) => key !== "sort_order" && active[key] !== activeSaved[key]
        )
      : false;

  /* ─────────────────────────── Order ─────────────────────────── */

  const savedOrder = useRef(initialEvents.map((event) => event.id).join(","));
  const orderTimer = useRef<number | null>(null);
  const pendingOrder = useRef<string[] | null>(null);

  // A drag left in flight when the screen closes is FLUSHED, not dropped.
  useEffect(() => {
    return () => {
      if (orderTimer.current === null) return;
      window.clearTimeout(orderTimer.current);

      const ids = pendingOrder.current;
      if (!ids || ids.join(",") === savedOrder.current) return;

      void fetch(withSite("/api/admin/events", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        keepalive: true,
      });
    };
  }, []);

  async function writeOrder(ids: string[]) {
    const key = ids.join(",");
    if (key === savedOrder.current) return;

    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/events", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not save the new order.");
        return;
      }

      // Only after it has landed, so a failed reorder can still be retried.
      savedOrder.current = key;
    } catch {
      setError("Network error while saving the order.");
    }
  }

  function queueOrder(list: CtrEvent[]) {
    pendingOrder.current = list.map((event) => event.id);

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

    setEvents((current) => {
      const from = current.findIndex((event) => event.id === fromId);
      const to = current.findIndex((event) => event.id === toId);
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
    setNotes(null);

    try {
      const response = await fetch(withSite(`/api/admin/events/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this event.");
        return;
      }

      /*
       * The server's copy replaces the draft, and here that is not merely tidy —
       * it is required. A change of address MOVES the event's folder and
       * rewrites every picture in the report to the new one. Keeping the sent
       * copy would leave the editor holding addresses that no longer exist, and
       * the next save would write them back over the rewritten rows.
       */
      const event = data.event as CtrEvent;
      setEvents((current) => current.map((e) => (e.id === event.id ? event : e)));
      setSaved((current) => current.map((e) => (e.id === event.id ? event : e)));
      setNotes({ id: event.id, list: Array.isArray(data.notes) ? data.notes : [] });
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Creates the event at the name and address the panel collected.
   *
   * The name becomes the TITLE, which is the field a one-off wants. A
   * championship round is usually headed by its circuit instead, so the title
   * can be cleared afterwards and the card falls back — see the hint on that
   * field.
   */
  async function handleCreate(title: string, slug: string) {
    setBusy(true);
    setError(null);
    setNotes(null);

    try {
      const response = await fetch(withSite("/api/admin/events", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BLANK_EVENT,
          title,
          slug,
          sort_order: events.reduce((top, event) => Math.max(top, event.sort_order), 0) + 10,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Left open, holding what was typed. The address is the likely reason,
        // and closing the panel would throw away the name along with it.
        setError(data.error ?? "Could not add an event.");
        return;
      }

      const event = data.event as CtrEvent;
      setEvents((current) => [...current, event]);
      setSaved((current) => [...current, event]);
      savedOrder.current = [...events.map((e) => e.id), event.id].join(",");
      setActiveId(event.id);
      setAdding(false);
      setNotes({ id: event.id, list: Array.isArray(data.notes) ? data.notes : [] });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * An address handed over from another event's history, dropped from the copy
   * of that event held on this screen.
   */
  function forgetSlug(holder: SlugHolder, slug: string) {
    const drop = (event: CtrEvent) =>
      event.id === holder.id
        ? { ...event, former_slugs: event.former_slugs.filter((entry) => entry !== slug) }
        : event;

    setEvents((current) => current.map(drop));
    setSaved((current) => current.map(drop));
  }

  async function handleDelete() {
    if (!active) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite(`/api/admin/events/${active.id}`, site), {
        method: "DELETE",
      });

      // A 404 means it is already gone, which is what was being asked for.
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this event.");
        return;
      }

      const gone = active.id;
      const remaining = events.filter((event) => event.id !== gone);

      // Open a neighbour rather than nothing: an empty right-hand pane after a
      // delete reads as a screen that has broken.
      const position = events.findIndex((event) => event.id === gone);
      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);

      setEvents(remaining);
      setSaved((current) => current.filter((event) => event.id !== gone));
      savedOrder.current = remaining.map((event) => event.id).join(",");
      setConfirmingDelete(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: CtrEvent) {
    setEvents((current) => current.map((e) => (e.id === next.id ? next : e)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const nameOf = (event: CtrEvent) =>
    eventName(event, tracks.find((track) => track.id === event.track_id)?.name) ||
    "Untitled event";

  const railItems: RailItem<string>[] = events.map((event) => ({
    id: event.id,
    short: nameOf(event),
    // The number first when there is one: a season is scanned by round, and
    // "01 · Kari Motor Speedway" reads the way the calendar does.
    title: [event.round, nameOf(event)].filter(Boolean).join(" · "),
    hint: [eventDateLabel(event) || "no date", EVENT_STATUS_LABELS[event.status]].join(" · "),
    // Present so the rail lets them be dragged. No `onToggleVisible` is passed,
    // so no eye appears: an event is not switched off, it is set back to draft.
    visible: true,
    Icon: CalendarIcon,
  }));

  /*
   * Where this event's pictures go — from the SAVED record, never the draft.
   *
   * Only the address is editable here — the sport is fixed by the screen. Using
   * the draft would upload into a folder named after a half-typed slug, and
   * abandoning the save would leave that file orphaned in a folder that never
   * comes to exist. `activeSaved` is the last thing the server acknowledged, so
   * it always names a folder that is real. The rename carries the files across;
   * see the PUT in src/app/api/admin/events/[id]/route.ts.
   */
  const uploadFolder = activeSaved
    ? folderForEntity(site.slug, "events", activeSaved.slug, activeSaved.id)
    : folderForModule(site.slug, "events");

  return (
    <UploadFolder folder={uploadFolder}>
      <div className="flex min-h-0 flex-col gap-2 md:h-full">
        <AdminRailSlot>
          <SectionRail
            heading="Season"
            items={railItems}
            active={activeId ?? ""}
            onSelect={setActiveId}
            onReorder={reorder}
          />
        </AdminRailSlot>

        <EditorToolbar
          Icon={CalendarIcon}
          title={active ? nameOf(active) : "Season"}
          hint={
            adding
              ? "Give the new event a name and an address."
              : active
                ? "Drag the sidebar to set the order the season runs in."
                : "No events yet — add the first one."
          }
          dirty={dirty}
          justSaved={justSaved}
          busy={busy}
          // Said once. While the new-event panel is open it owns the failure,
          // because the field that caused it is in that panel.
          error={adding ? null : error}
          onSave={handleSave}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
                setConfirmingDelete(false);
                setError(null);
                setNotes(null);
              }}
              disabled={busy || adding}
            >
              <PlusIcon />
              Add event
            </Button>
          }
          fieldsOpen={fieldsOpen}
          onToggleFields={() => setFieldsOpen((open) => !open)}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          {/* Hidden below lg: at that width the fields already fill the screen,
              and a preview shrunk into what is left would be unreadable. */}
          <EventPreview
            event={adding ? null : active}
            tracks={tracks}
            className="hidden lg:block lg:min-w-0 lg:flex-1"
          />

          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card md:overflow-y-auto",
              fieldsOpen ? "lg:w-[440px] lg:flex-none xl:w-[520px]" : "lg:hidden"
            )}
          >
            <div className="space-y-2.5 bg-background/40 p-3">
              {/* Anything the server had to change on the way in. Silence here is
                  how an address quietly stops being the one on the poster. */}
              {active && notes && notes.id === active.id && notes.list.length > 0 ? (
                <Panel title="Saved, with changes">
                  <ul className="space-y-1">
                    {notes.list.map((note) => (
                      <li key={note} className="text-xs leading-relaxed text-foreground">
                        {note}
                      </li>
                    ))}
                  </ul>
                  <Note className="mt-2">
                    These are what the server tidied up. Nothing else was touched.
                  </Note>
                </Panel>
              ) : null}

              {adding ? (
                <NewRecord
                  kind="event"
                  title="New event"
                  namePlaceholder="Round 01 at Kari"
                  busy={busy}
                  error={error}
                  onCreate={handleCreate}
                  onCancel={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  onReleased={forgetSlug}
                />
              ) : active ? (
                confirmingDelete ? (
                  <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                    <p className="text-xs leading-relaxed text-foreground">
                      Delete <span className="font-medium">{nameOf(active)}</span>? Its address
                      stops working, it leaves the calendar, and anything written on it is gone.
                      This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={busy}
                      >
                        {busy ? "Deleting…" : "Delete event"}
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
                  <EventForm
                    event={active}
                    tracks={tracks}
                    siteUrl={siteUrl}
                    onChange={update}
                    onDelete={() => setConfirmingDelete(true)}
                    onReleasedSlug={forgetSlug}
                    busy={busy}
                  />
                )
              ) : (
                <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
                  No events yet. Use <span className="text-foreground">Add event</span> above to
                  announce the first one.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </UploadFolder>
  );
}
