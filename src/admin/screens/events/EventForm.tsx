"use client";

import {
  EVENT_LIMITS,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type CtrEvent,
  type EventStatus,
} from "@/lib/events";
import { eventDateLabel } from "@/lib/raceDates";
import type { RichDoc } from "@/lib/richtext";
import type { SlugHolder } from "@/lib/slug";
import type { Track } from "@/lib/tracks";
import { Button } from "@/admin/ui/Button";
import { Input, Label, Select } from "@/admin/ui/Input";
import { ExternalIcon, TrashIcon } from "@/admin/ui/icons";
import { Field, Hint, Note, Panel, Row, TextArea } from "@/admin/components/Fields";
import { FormerSlugs } from "@/admin/components/FormerSlugs";
import { ImageField } from "@/admin/components/ImageField";
import { SlugField } from "@/admin/components/SlugField";
import { RichText } from "@/admin/components/richtext/RichText";

/**
 * One event's fields.
 *
 * A pure controlled component, like `ArticleForm` and `DeckForm`: no fetching,
 * no state of its own, everything through one `set`.
 *
 * The order is the order somebody fills it in. What it is and where it lives,
 * then when, then where, then the entry form, then the picture, then — last and
 * longest — the report. The four panels above the body decide whether the page
 * is right; the body is the job you come back to after the weekend.
 */
export function EventForm({
  event,
  tracks,
  siteUrl,
  onChange,
  onDelete,
  onReleasedSlug,
  busy,
}: {
  event: CtrEvent;
  /** This sport's circuits, for the picker. Fetched by the screen, never here. */
  tracks: Track[];
  /**
   * Where the public site answers. The admin is on a different hostname, so a
   * relative link to an event from here would resolve against the admin host.
   */
  siteUrl: string;
  onChange: (next: CtrEvent) => void;
  onDelete: () => void;
  onReleasedSlug?: (holder: SlugHolder, slug: string) => void;
  busy?: boolean;
}) {
  const set = (patch: Partial<CtrEvent>) => onChange({ ...event, ...patch });

  const track = tracks.find((entry) => entry.id === event.track_id);

  return (
    <div className="space-y-2.5">
      <Panel title="Event">
        <div className="space-y-3">
          <Row>
            <Field
              label="Number"
              value={event.round}
              onChange={(round) => set({ round })}
              maxLength={EVENT_LIMITS.round}
              placeholder="01"
              hint="Printed large over the photograph. Blank draws none."
            />
            <label className="block">
              <Label>Status</Label>
              <Select
                value={event.status}
                onChange={(e) => set({ status: e.target.value as EventStatus })}
                disabled={busy}
                className="mt-1.5"
              >
                {EVENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {EVENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <Hint className="mt-1">
                A draft is off the calendar and its address 404s.
              </Hint>
            </label>
          </Row>

          <Field
            label="Title"
            value={event.title}
            onChange={(title) => set({ title })}
            maxLength={EVENT_LIMITS.title}
            placeholder={track?.name || "Leave blank to use the circuit's name"}
            hint="Blank uses the circuit's name, which is what a championship round wants. Fill it in for a launch, a test or a one-off."
          />

          <TextArea
            label="Subtitle"
            value={event.subtitle}
            onChange={(subtitle) => set({ subtitle })}
            rows={2}
            maxLength={EVENT_LIMITS.subtitle}
            hint="One line under the name, on the big card and the event's own page."
          />

          <SlugField
            kind="event"
            value={event.slug}
            onChange={(slug) => set({ slug })}
            exceptId={event.id}
            suggestion={event.title || (event.round ? `round ${event.round}` : "")}
            onReleased={onReleasedSlug}
            disabled={busy}
          />

          <FormerSlugs
            kind="event"
            slugs={event.former_slugs}
            onChange={(former_slugs) => set({ former_slugs })}
            disabled={busy}
          />

          <Field
            label="Chip"
            value={event.badge}
            onChange={(badge) => set({ badge })}
            maxLength={EVENT_LIMITS.badge}
            placeholder="Entries open"
            hint="A short note beside the name. Blank hides it. Not the same as the status above — this one is words for a visitor."
          />

          {event.status === "published" && event.slug ? (
            <a
              href={`${siteUrl}/schedule`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-fg underline underline-offset-2 transition-colors hover:text-foreground"
            >
              <ExternalIcon className="size-3.5" />
              Open /schedule
            </a>
          ) : null}
        </div>
      </Panel>

      <Panel title="When">
        <div className="space-y-3">
          <Row>
            <label className="block">
              <Label>First day</Label>
              <Input
                type="date"
                value={event.date_from}
                onChange={(e) => set({ date_from: e.target.value })}
                disabled={busy}
                className="mt-1.5"
              />
            </label>
            <label className="block">
              <Label>Last day</Label>
              <Input
                type="date"
                value={event.date_to}
                onChange={(e) => set({ date_to: e.target.value })}
                disabled={busy}
                className="mt-1.5"
              />
            </label>
          </Row>

          <Note>
            The countdown counts to the first day, and the season is ordered by the list on the
            left rather than by these. Leave the last day blank for a single-day event. An event
            with no first day has no countdown, which is the honest way to show a date nobody has
            fixed.
          </Note>

          <Field
            label="Date line"
            value={event.dates}
            onChange={(dates) => set({ dates })}
            maxLength={EVENT_LIMITS.dates}
            placeholder={eventDateLabel({ ...event, dates: "" }) || "11–13 September 2026"}
            hint="Overrides the printed dates. Blank writes them from the two dates above."
          />
        </div>
      </Panel>

      <Panel title="Where">
        <div className="space-y-3">
          <div className="block">
            <Label>Circuit</Label>
            <Select
              value={event.track_id}
              onChange={(e) => set({ track_id: e.target.value })}
              disabled={busy}
              className="mt-1.5 w-full"
            >
              <option value="">— none, use the text below —</option>
              {tracks.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.location ? ` · ${entry.location}` : ""}
                </option>
              ))}
            </Select>
            <Hint className="mt-1">
              {tracks.length === 0
                ? "No circuits for this sport yet — add them on the Circuits screen."
                : "Brings the photograph, the map, the length and the corner count with it."}
            </Hint>
          </div>

          {event.track_id ? null : (
            <Row>
              <Field
                label="Venue"
                value={event.venue}
                onChange={(venue) => set({ venue })}
                maxLength={EVENT_LIMITS.venue}
              />
              <Field
                label="City"
                value={event.city}
                onChange={(city) => set({ city })}
                maxLength={EVENT_LIMITS.city}
              />
            </Row>
          )}
        </div>
      </Panel>


      <Panel title="Cover">
        <ImageField
          label="Cover image"
          value={event.cover_image}
          onChange={(cover_image) => set({ cover_image })}
          disabled={busy}
          variant="photo"
          hint="Behind the big card and at the top of the event's page. Blank falls back to the circuit's photograph, which is usually what you want."
        />
      </Panel>

      <Panel title="Report">
        <RichText
          // Keyed so switching event REBUILDS the editor rather than pushing a
          // whole new document through the running one. ProseMirror keeps undo
          // history per instance, and history that spans two events would let
          // Ctrl-Z paste one into the other.
          key={event.id}
          value={event.body as RichDoc}
          onChange={(body) => set({ body })}
          disabled={busy}
        />
        <Note className="mt-2">
          Optional, and usually written afterwards. An event with nothing here still has a page —
          the dates, the circuit and the entry link are the page until there is a result.
        </Note>
      </Panel>

      <Panel title="Danger">
        <Note className="mb-2">
          Deleting an event stops its address working and takes anything written on it. Any picture
          used only by this event is removed with it; anything shared is moved to the shared
          uploads folder.
        </Note>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={busy}>
          <TrashIcon />
          Delete this event
        </Button>
      </Panel>
    </div>
  );
}
