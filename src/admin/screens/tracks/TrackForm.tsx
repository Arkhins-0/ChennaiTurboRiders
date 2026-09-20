"use client";

import {
  isUsableHref,
  TRACK_LIMITS,
  TRACK_MAX_LINKS,
  type Track,
  type TrackLink,
} from "@/lib/tracks";
import { Button } from "@/admin/ui/Button";
import { Input, Label, Textarea } from "@/admin/ui/Input";
import { TrashIcon } from "@/admin/ui/icons";
import { Field, Hint, Panel, Row } from "@/admin/components/Fields";
import { Repeater } from "@/admin/components/Repeater";
import { ImageField } from "@/admin/components/ImageField";
import { TrackOutline } from "@/components/site/CircuitMap";
import { Media } from "@/components/ui/Media";

/**
 * Everything about one circuit, in the order the public page reads it.
 *
 * The panels are named after what they produce, not after the columns they
 * write: "Headline numbers" is the strip under the circuit's name, "The record"
 * is the table beside the layout. Someone who has never seen this schema should
 * be able to open a panel and know which part of the page they are about to
 * change, and every hint here says so in as many words.
 *
 * That is deliberate and it is the reason the groupings do not match the
 * database. `length` and `lap_record_time` sit together because they appear
 * together on the page; `fia_grade` sits apart from them because it does not.
 *
 * The form holds no state of its own. The editor owns the draft, this draws it,
 * and every change goes straight back up — so the preview beside it is never a
 * keystroke behind.
 */
export function TrackForm({
  track,
  onChange,
  onDelete,
  busy,
}: {
  track: Track;
  onChange: (next: Track) => void;
  onDelete: () => void;
  busy: boolean;
  }) {
  function set<K extends keyof Track>(key: K, value: Track[K]) {
    onChange({ ...track, [key]: value });
  }

  /** A plain text field. Almost every field on this form is one. */
  function field(
    key: keyof Track & keyof typeof TRACK_LIMITS,
    label: string,
    placeholder?: string,
    hint?: string
  ) {
    return (
      <label className="block">
        <Label>{label}</Label>
        <Input
          value={String(track[key] ?? "")}
          onChange={(event) => set(key, event.target.value as Track[typeof key])}
          maxLength={TRACK_LIMITS[key]}
          placeholder={placeholder}
          className="mt-1.5"
        />
        {hint ? <Hint className="mt-1">{hint}</Hint> : null}
      </label>
    );
  }

  return (
    <div className="space-y-2.5">
      <Panel title="Name and place" hint="The title on the circuit’s page, and the line beneath it.">
        <div className="space-y-3">
          {field("name", "Circuit name", "Madras International Circuit")}
          {field(
            "location",
            "Where it is",
            "Irungattukottai, Chennai",
            "One line. It also labels this circuit on the calendar."
          )}
        </div>
      </Panel>

      <Panel
        title="Track layout"
        hint="The drawing at the centre of the circuit’s page — the reason the page exists."
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
              {track.svg_path ? (
                <TrackOutline
                  path={track.svg_path}
                  viewBox={track.svg_view_box}
                  className="p-2 text-primary"
                />
              ) : track.map_url ? (
                <Media src={track.map_url} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <span className="px-2 text-center text-[10px] leading-tight text-muted-fg">
                  Nothing drawn yet
                </span>
              )}
            </span>

            <Hint>
              An outline path is preferred over an image everywhere: it is drawn in the page&rsquo;s
              own colour and stays sharp at any size, so the same circuit reads on the dark page
              and on this white tile without two files.
            </Hint>
          </div>

          <label className="block">
            <Label>Outline path</Label>
            <Textarea
              value={track.svg_path}
              onChange={(event) => set("svg_path", event.target.value)}
              maxLength={TRACK_LIMITS.svg_path}
              rows={4}
              spellCheck={false}
              placeholder="M72 196C44 188 36 152 58 132…"
              className="mt-1.5 font-mono text-[11px]"
            />
            <Hint className="mt-1">
              The <code className="text-foreground">d</code> attribute of a single{" "}
              <code className="text-foreground">&lt;path&gt;</code> — not the whole SVG file.
              Anything that is not path data is stripped when you save, so a bad paste simply does
              not draw.
            </Hint>
          </label>

          {field(
            "svg_view_box",
            "Drawing area",
            "0 0 400 260",
            "The viewBox of the SVG the path came from. Copy it across or the outline will be cropped."
          )}

          <ImageField
            label="Layout image"
            variant="logo"
            value={track.map_url}
            onChange={(url) => set("map_url", url)}
            disabled={busy}
            hint="A published drawing of the track. Only used when there is no outline path above."
          />
        </div>
      </Panel>

      <Panel
        title="Photograph"
        hint="Behind the circuit’s name here, and behind the next round on the calendar."
      >
        <ImageField
          label="Photograph of the circuit"
          value={track.photo_url}
          onChange={(url) => set("photo_url", url)}
          disabled={busy}
          hint="A picture of the place, not a drawing of the layout — the layout has its own field above."
        />
      </Panel>

      <Panel
        title="Headline numbers"
        hint="The strip directly under the circuit’s name. Anything left blank is dropped from it."
      >
        <div className="space-y-3">
          <Row>
            {field(
              "length",
              "Circuit length",
              "3.717 km (2.310 mi)",
              "Written as you want it read. The number is set large and the rest small beside it."
            )}
            {field("turns", "Turns", "17")}
          </Row>

          <Row>
            {field("lap_record_time", "Lap record", "1:30.323")}
            {field("lap_record_year", "Lap record set in", "2020")}
          </Row>

          <label className="block">
            <Label>Races held here</Label>
            <Input
              type="number"
              min={0}
              value={String(track.races_held)}
              onChange={(event) => set("races_held", Number(event.target.value) || 0)}
              className="mt-1.5"
            />
            <Hint className="mt-1">Zero leaves it out of the strip.</Hint>
          </label>

          <Hint>
            Who set the lap record, and in what, are a racer and a team — they get their own tables,
            so there is deliberately nowhere to type a name here.
          </Hint>
        </div>
      </Panel>

      <Panel
        title="The record"
        hint="The table beside the layout. Rows with nothing in them are not printed at all."
      >
        <div className="space-y-3">
          <Row>
            {field("fia_grade", "FIA grade", "2", "The number only — “Grade” is added for you.")}
            {field("direction", "Direction", "Clockwise")}
          </Row>
          <Row>
            {field("opened", "Opened", "1990")}
            {field("broke_ground", "Broke ground", "1988")}
          </Row>
          <Row>
            {field("capacity", "Spectator capacity", "25,000")}
            {field("owner", "Owner", "Madras Motor Sports Club")}
          </Row>
          {field(
            "former_names",
            "Former names",
            "Madras Motor Race Track; Irungattukottai Race Track",
            "Separate them with a semicolon."
          )}
          {field("coordinates", "Coordinates", "13°0′9″N 79°59′9″E")}
        </div>
      </Panel>

      <Panel
        title="Championships hosted"
        hint="Listed as chips lower down the circuit’s page."
      >
        <label className="block">
          <Label>One championship per line</Label>
          <Textarea
            value={track.major_events}
            onChange={(event) => set("major_events", event.target.value)}
            maxLength={TRACK_LIMITS.major_events}
            rows={5}
            placeholder={"Indian Racing League\nMRF Formula 2000\nF4 India"}
            className="mt-1.5"
          />
        </label>
      </Panel>

      <Panel title="Track summary" hint="The short description of what the circuit is like.">
        <label className="block">
          <Label>Summary</Label>
          <Textarea
            value={track.note}
            onChange={(event) => set("note", event.target.value)}
            maxLength={TRACK_LIMITS.note}
            rows={3}
            placeholder="One line on what the circuit is like to drive."
            className="mt-1.5"
          />
          <Hint className="mt-1">
            Also the line under the circuit&rsquo;s name in the list of circuits.
          </Hint>
        </label>
      </Panel>

      {/*
        Collapsed strips that open in place, the way the banners do: a link is
        two short fields, so a window to edit them would be more ceremony than
        they are worth, and six of them left open would bury everything under
        this panel.

        The strip says the link's own text and where it points, so the list can
        be read — and reordered — without opening anything.
      */}
      <Repeater<TrackLink>
        title="Related links"
        addLabel="Add link"
        items={track.links}
        max={TRACK_MAX_LINKS}
        onChange={(links) => set("links", links)}
        blank={() => ({ label: "", href: "" })}
        expand="accordion"
        summary={(link) => ({
          title: link.label || link.href || "New link",
          // Not repeated under a label that is already the address.
          hint: link.href && link.href !== link.label ? link.href : undefined,
        })}
        empty="No links yet. The block is left off the page entirely until there is one."
        note="Drag a link by its handle to reorder — the order here is the order on the circuit's page."
      >
        {(link, _index, patch) => (
          <Row>
            <Field
              label="Link text"
              value={link.label}
              onChange={(label) => patch({ label })}
              maxLength={TRACK_LIMITS.link_label}
              placeholder="Official site"
              hint="Left blank, the address is used."
            />
            <label className="block">
              <Label>Address</Label>
              <Input
                value={link.href}
                onChange={(event) => patch({ href: event.target.value })}
                maxLength={TRACK_LIMITS.link_href}
                placeholder="madrasmotorsports.com"
                className="mt-1.5"
              />

              {/*
                Said here, while it is being typed, rather than letting the row
                disappear on save. The check is the server's own function, so
                the warning cannot disagree with what actually happens.
              */}
              {link.href.trim() && !isUsableHref(link.href) ? (
                <span className="mt-1 block text-[11px] text-destructive">
                  This will not save. Use an address like{" "}
                  <code className="text-foreground">madrasmotorsports.com</code> or a path on this
                  site like <code className="text-foreground">/entry-list.pdf</code>.
                </span>
              ) : (
                <Hint className="mt-1">
                  A bare address is fine — <code className="text-foreground">https://</code> is
                  added for you. A row with no address at all is dropped when you save.
                </Hint>
              )}
            </label>
          </Row>
        )}
      </Repeater>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-muted-fg">
          Deleting a circuit leaves any round that visits it showing the venue name typed on the
          round itself.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="shrink-0 hover:text-destructive"
        >
          <TrashIcon />
          Delete
        </Button>
      </div>
    </div>
  );
}
